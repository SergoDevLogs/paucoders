#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging
import os
from dotenv import load_dotenv
import joblib
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder, RobustScaler
from sklearn.metrics import mean_absolute_error, r2_score, mean_absolute_percentage_error
import warnings
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor

warnings.filterwarnings('ignore')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CattleAnalyzer:
    def __init__(self, db_config=None, data_dir='.'):
        """
        Параметры подключения к БД можно передать словарём db_config:
            host, port, dbname, user, password
        Если не указаны, берутся из переменных окружения:
            DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
        data_dir используется только для сохранения/загрузки модели (прежняя логика).
        """
        self.data_dir = data_dir
        self.all_cows = None
        self.datasets = []
        self.model = None
        self.scaler = RobustScaler()
        self.label_encoders = {}
        self.feature_columns = None
        self.model_metrics = {}
        self.y_mean = 0
        self.y_std = 1
        self.reference_date = None
        self.forecast_days = 30

        self.db_config = db_config or {}
        if not self.db_config:
            load_dotenv()
            self.db_config = {
                'host': os.getenv('DB_HOST', ''),
                'port': os.getenv('DB_PORT', ''),
                'dbname': os.getenv('DB_NAME', ''),
                'user': os.getenv('DB_USER', ''),
                'password': os.getenv('DB_PASS', '')
            }

        self.load_data()
        if not self.all_cows.empty:
            self.prepare_features()

    def load_data(self):
        """Загружает данные из таблицы public."Cow" и приводит к формату, ожидаемому классом."""
        try:
            conn = psycopg2.connect(**self.db_config)
            query = 'SELECT * FROM public."Cow"'
            df = pd.read_sql(query, conn)
            conn.close()
            logger.info(f"Загружено {len(df)} записей из БД")
        except Exception as e:
            logger.error(f"Ошибка подключения к БД или выполнения запроса: {e}")
            self.all_cows = pd.DataFrame()
            self.datasets = []
            return

        column_mapping = {
            'cowId': 'Номер животного',
            'birthday': 'Дата рождения',
            'archiveDate': 'Дата архива',
            'lactation': 'Лактация',
            'dryDate': 'Дата запуска тек.лакт',
            'inseminationDate': 'Дата осеменения',
            'lactationDate': 'Дата начала тек.лакт',
            'status': 'Статус коровы',
            'expectedCalvingDate': 'Дата ожидаемого отела',
            'expectedDryDate': 'Дата ожидаемого запуска',
            'currentInsemination': 'Дата успешного осеменения',
        }
        df.rename(columns=column_mapping, inplace=True)

        if 'Порода' not in df.columns:
            df['Порода'] = 'Неизвестно'
        if 'Кличка животного' not in df.columns:
            df['Кличка животного'] = ''

        df['dataset_name'] = 'dataset_' + df['datasetID'].astype(str)

        df = df.replace(['None', 'none', '', 'NULL', 'null'], np.nan)

        date_columns = [
            'Дата рождения', 'Дата архива', 'Дата начала тек.лакт',
            'Дата осеменения', 'Дата успешного осеменения',
            'Дата запуска тек.лакт', 'Дата ожидаемого запуска',
            'Дата ожидаемого отела'
        ]
        for col in date_columns:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors='coerce')

        numeric_columns = ['Лактация', 'Дни стельности']
        for col in numeric_columns:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                df[col] = df[col].fillna(0)

        all_dates = []
        for col in date_columns:
            if col in df.columns:
                valid_dates = df[col].dropna()
                if not valid_dates.empty:
                    all_dates.extend(valid_dates.tolist())
        if all_dates:
            self.reference_date = max(all_dates)
        else:
            self.reference_date = datetime.now()

        if 'Дни стельности' not in df.columns:
            df['Дни стельности'] = 0

        self.all_cows = df
        self.datasets = df['dataset_name'].unique().tolist()

        logger.info(f"Всего загружено записей после очистки: {len(self.all_cows)}")
        logger.info(f"Референтная дата: {self.reference_date.strftime('%d.%m.%Y')}")
        logger.info(f"Прогнозный горизонт по умолчанию: {self.forecast_days} дней")
        logger.info(f"Загруженные датасеты: {', '.join(self.datasets)}")

        if 'Статус коровы' in self.all_cows.columns:
            status_counts = self.all_cows['Статус коровы'].value_counts()
            logger.info(f"Распределение по статусам:\n{status_counts}")

    def get_datasets(self):
        """Возвращает список идентификаторов датасетов (строки вида dataset_1)."""
        return self.datasets

    def _filter_by_dataset(self, df, dataset_name=None):
        if dataset_name is not None and 'dataset_name' in df.columns:
            if dataset_name == 'all' or dataset_name == '':
                return df
            return df[df['dataset_name'] == dataset_name]
        return df

    def prepare_features(self):
        """Подготавливает признаки для обучения, включая вычисление 'Дни стельности', если необходимо."""
        if self.all_cows.empty:
            logger.error("Нет данных для подготовки признаков")
            return

        df = self.all_cows.copy()

        if 'Дни стельности' in df.columns and df['Дни стельности'].sum() == 0:
            if 'Дата успешного осеменения' in df.columns:
                df['Дни стельности'] = df.apply(
                    lambda row: (self.reference_date - row['Дата успешного осеменения']).days
                    if pd.notna(row.get('Дата успешного осеменения')) else 0,
                    axis=1
                )
            else:
                df['Дни стельности'] = 0

        df['возраст_дни'] = df['Дата рождения'].apply(
            lambda x: (self.reference_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_начала_лакт'] = df['Дата начала тек.лакт'].apply(
            lambda x: (self.reference_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_осеменения'] = df['Дата осеменения'].apply(
            lambda x: (self.reference_date - x).days if pd.notna(x) else 0
        )
        df['дни_до_отела'] = df['Дата ожидаемого отела'].apply(
            lambda x: (x - self.reference_date).days if pd.notna(x) else 0
        )
        df['возраст_годы'] = df['возраст_дни'] / 365.25
        df['логарифм_возраста'] = np.log1p(df['возраст_дни'])
        df['логарифм_дней_лактации'] = np.log1p(df['дни_с_начала_лакт'])

        future_date = self.reference_date + timedelta(days=self.forecast_days)
        df['возраст_дни_прогноз'] = df['Дата рождения'].apply(
            lambda x: (future_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_начала_лакт_прогноз'] = df['Дата начала тек.лакт'].apply(
            lambda x: (future_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_осеменения_прогноз'] = df['Дата осеменения'].apply(
            lambda x: (future_date - x).days if pd.notna(x) else 0
        )
        df['дни_до_отела_прогноз'] = df['Дата ожидаемого отела'].apply(
            lambda x: (x - future_date).days if pd.notna(x) else 0
        )
        df['возраст_годы_прогноз'] = df['возраст_дни_прогноз'] / 365.25
        df['целевые_дни_доения_месяц'] = df.apply(
            lambda row: self.calculate_milking_days(row, future_date), axis=1
        )

        df = df[df['целевые_дни_доения_месяц'] >= 0]
        df = df[df['целевые_дни_доения_месяц'] < 1000]

        if len(df) == 0:
            logger.error("Нет данных для обучения после фильтрации!")
            self.prepared_data = pd.DataFrame()
            return

        self.y_mean = df['целевые_дни_доения_месяц'].mean()
        self.y_std = df['целевые_дни_доения_месяц'].std()
        if self.y_std == 0:
            self.y_std = 1
        df['целевые_дни_доения_норм'] = (df['целевые_дни_доения_месяц'] - self.y_mean) / self.y_std

        categorical_cols = ['Статус коровы', 'Порода', 'Кличка животного']
        for col in categorical_cols:
            if col in df.columns:
                le = LabelEncoder()
                df[col] = df[col].fillna('Неизвестно').astype(str)
                df[col + '_encoded'] = le.fit_transform(df[col])
                self.label_encoders[col] = le

        feature_cols = [
            'Лактация',
            'возраст_дни', 'возраст_годы', 'логарифм_возраста',
            'дни_с_начала_лакт', 'логарифм_дней_лактации',
            'дни_с_осеменения', 'дни_до_отела', 'Дни стельности',
            'возраст_дни_прогноз', 'возраст_годы_прогноз',
            'дни_с_начала_лакт_прогноз', 'дни_с_осеменения_прогноз', 'дни_до_отела_прогноз'
        ]

        for col in categorical_cols:
            if col + '_encoded' in df.columns:
                feature_cols.append(col + '_encoded')

        self.feature_columns = [col for col in feature_cols if col in df.columns]

        for col in self.feature_columns:
            df[col] = df[col].fillna(0)
            q1 = df[col].quantile(0.01)
            q99 = df[col].quantile(0.99)
            df[col] = df[col].clip(q1, q99)

        self.prepared_data = df
        logger.info(f"Подготовлено {len(self.prepared_data)} записей для обучения")
        logger.info(f"Среднее значение целевой переменной: {self.y_mean:.2f}")
        logger.info(f"Стандартное отклонение: {self.y_std:.2f}")
        logger.info(f"Количество признаков: {len(self.feature_columns)}")

    def calculate_milking_days(self, row, target_date=None):
        if target_date is None:
            target_date = self.reference_date

        last_calving = row.get('Дата начала тек.лакт')
        if pd.isna(last_calving):
            return 0

        if pd.notna(row.get('Дата запуска тек.лакт')):
            dry_date = row['Дата запуска тек.лакт']
            if pd.notna(dry_date) and dry_date <= target_date:
                return (dry_date - last_calving).days
            else:
                return (target_date - last_calving).days
        else:
            return (target_date - last_calving).days

    def calculate_service_period(self, row):
        if pd.isna(row.get('Дата успешного осеменения')):
            return None
        last_calving = row.get('Дата начала тек.лакт')
        if pd.isna(last_calving):
            return None
        successful_insem = row['Дата успешного осеменения']
        return (successful_insem - last_calving).days

    def classify_animal(self, row):
        age_days = (self.reference_date - row['Дата рождения']).days if pd.notna(row['Дата рождения']) else 0
        if age_days < 730:
            if pd.notna(row.get('Дата успешного осеменения')):
                return 'Нетель'
            else:
                return 'Телка'
        else:
            return 'Корова'

    def check_ideal_cow(self, cow_id, dataset_name=None):
        cow_data = self.all_cows[self.all_cows['Номер животного'] == cow_id]
        cow_data = self._filter_by_dataset(cow_data, dataset_name)
        if len(cow_data) < 2:
            return False
        lactations = cow_data.sort_values('Лактация')
        for i in range(len(lactations)-1):
            current = lactations.iloc[i]
            next_lact = lactations.iloc[i+1]
            milking_days = self.calculate_milking_days(current, current['Дата запуска тек.лакт'])
            if abs(milking_days - 305) > 5:
                return False
            dry_days = (next_lact['Дата начала тек.лакт'] - current['Дата запуска тек.лакт']).days
            if abs(dry_days - 60) > 5:
                return False
            calving_interval = (next_lact['Дата начала тек.лакт'] - current['Дата начала тек.лакт']).days
            if abs(calving_interval - 365) > 10:
                return False
        return True

    def prepare_features(self):
        if self.all_cows.empty:
            logger.error("Нет данных для подготовки признаков")
            return

        df = self.all_cows.copy()
        df['возраст_дни'] = df['Дата рождения'].apply(
            lambda x: (self.reference_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_начала_лакт'] = df['Дата начала тек.лакт'].apply(
            lambda x: (self.reference_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_осеменения'] = df['Дата осеменения'].apply(
            lambda x: (self.reference_date - x).days if pd.notna(x) else 0
        )
        df['дни_до_отела'] = df['Дата ожидаемого отела'].apply(
            lambda x: (x - self.reference_date).days if pd.notna(x) else 0
        )
        df['возраст_годы'] = df['возраст_дни'] / 365.25
        df['логарифм_возраста'] = np.log1p(df['возраст_дни'])
        df['логарифм_дней_лактации'] = np.log1p(df['дни_с_начала_лакт'])

        future_date = self.reference_date + timedelta(days=self.forecast_days)
        df['возраст_дни_прогноз'] = df['Дата рождения'].apply(
            lambda x: (future_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_начала_лакт_прогноз'] = df['Дата начала тек.лакт'].apply(
            lambda x: (future_date - x).days if pd.notna(x) else 0
        )
        df['дни_с_осеменения_прогноз'] = df['Дата осеменения'].apply(
            lambda x: (future_date - x).days if pd.notna(x) else 0
        )
        df['дни_до_отела_прогноз'] = df['Дата ожидаемого отела'].apply(
            lambda x: (x - future_date).days if pd.notna(x) else 0
        )
        df['возраст_годы_прогноз'] = df['возраст_дни_прогноз'] / 365.25
        df['целевые_дни_доения_месяц'] = df.apply(
            lambda row: self.calculate_milking_days(row, future_date), axis=1
        )

        df = df[df['целевые_дни_доения_месяц'] >= 0]
        df = df[df['целевые_дни_доения_месяц'] < 1000]

        if len(df) == 0:
            logger.error("Нет данных для обучения после фильтрации!")
            self.prepared_data = pd.DataFrame()
            return

        self.y_mean = df['целевые_дни_доения_месяц'].mean()
        self.y_std = df['целевые_дни_доения_месяц'].std()
        if self.y_std == 0:
            self.y_std = 1
        df['целевые_дни_доения_норм'] = (df['целевые_дни_доения_месяц'] - self.y_mean) / self.y_std

        categorical_cols = ['Статус коровы', 'Порода', 'Кличка животного']
        for col in categorical_cols:
            if col in df.columns:
                le = LabelEncoder()
                df[col] = df[col].fillna('Неизвестно').astype(str)
                df[col + '_encoded'] = le.fit_transform(df[col])
                self.label_encoders[col] = le

        feature_cols = [
            'Лактация',
            'возраст_дни', 'возраст_годы', 'логарифм_возраста',
            'дни_с_начала_лакт', 'логарифм_дней_лактации',
            'дни_с_осеменения', 'дни_до_отела', 'Дни стельности',
            'возраст_дни_прогноз', 'возраст_годы_прогноз',
            'дни_с_начала_лакт_прогноз', 'дни_с_осеменения_прогноз', 'дни_до_отела_прогноз'
        ]

        for col in categorical_cols:
            if col + '_encoded' in df.columns:
                feature_cols.append(col + '_encoded')

        self.feature_columns = [col for col in feature_cols if col in df.columns]

        for col in self.feature_columns:
            df[col] = df[col].fillna(0)
            q1 = df[col].quantile(0.01)
            q99 = df[col].quantile(0.99)
            df[col] = df[col].clip(q1, q99)

        self.prepared_data = df
        logger.info(f"Подготовлено {len(self.prepared_data)} записей для обучения")
        logger.info(f"Среднее значение целевой переменной: {self.y_mean:.2f}")
        logger.info(f"Стандартное отклонение: {self.y_std:.2f}")
        logger.info(f"Количество признаков: {len(self.feature_columns)}")

    def train_model(self):
        if self.prepared_data.empty:
            logger.error("Нет данных для обучения")
            return False

        try:
            X = self.prepared_data[self.feature_columns]
            y = self.prepared_data['целевые_дни_доения_норм']

            if len(X) < 10:
                logger.error(f"Слишком мало данных для обучения: {len(X)} записей")
                return False

            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )

            X_train_scaled = self.scaler.fit_transform(X_train)
            X_test_scaled = self.scaler.transform(X_test)

            self.model = GradientBoostingRegressor(
                n_estimators=100,
                max_depth=3,
                learning_rate=0.1,
                subsample=0.8,
                min_samples_split=10,
                min_samples_leaf=5,
                max_features='sqrt',
                loss='huber',
                random_state=42
            )

            self.model.fit(X_train_scaled, y_train)

            y_pred_norm = self.model.predict(X_test_scaled)
            y_pred = y_pred_norm * self.y_std + self.y_mean
            y_true = y_test * self.y_std + self.y_mean

            mask = y_true > 1
            if mask.any():
                mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100
            else:
                mape = 0

            self.model_metrics = {
                'mae': mean_absolute_error(y_true, y_pred),
                'mape': mape,
                'r2': r2_score(y_true, y_pred),
                'train_size': len(X_train),
                'test_size': len(X_test),
                'y_mean': self.y_mean,
                'y_std': self.y_std,
                'reference_date': self.reference_date.strftime('%d.%m.%Y'),
                'forecast_days': self.forecast_days,
                'feature_importance': dict(zip(self.feature_columns,
                                              self.model.feature_importances_))
            }

            logger.info(f"Модель обучена. MAE: {self.model_metrics['mae']:.2f} дней, MAPE: {self.model_metrics['mape']:.2f}%, R2: {self.model_metrics['r2']:.3f}")

            self.save_model()
            return True

        except Exception as e:
            logger.error(f"Ошибка при обучении модели: {e}")
            import traceback
            traceback.print_exc()
            return False

    def predict_milking_days_monthly(self, cow_data, target_date=None, dataset_name=None):
        if self.model is None:
            if not self.load_model():
                return {'error': 'Модель не доступна'}

        try:
            if target_date is not None:
                if isinstance(target_date, str):
                    try:
                        future_date = pd.to_datetime(target_date, format='%d.%m.%Y')
                    except:
                        future_date = pd.to_datetime(target_date, errors='coerce')
                else:
                    future_date = target_date
                if pd.isna(future_date):
                    return {'error': 'Неверный формат даты. Используйте ДД.ММ.ГГГГ'}
            else:
                future_date = self.reference_date + timedelta(days=self.forecast_days)

            def get_value(key, default=None):
                val = cow_data.get(key)
                if pd.isna(val) or val is None or val == 'None' or val == '':
                    return default
                return val

            def parse_date(date_val):
                if date_val is None or pd.isna(date_val):
                    return None
                if isinstance(date_val, pd.Timestamp):
                    return date_val
                if isinstance(date_val, str):
                    for fmt in ['%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y']:
                        try:
                            return pd.to_datetime(date_val, format=fmt)
                        except:
                            continue
                    return pd.to_datetime(date_val, errors='coerce')
                return None

            birth_date = parse_date(get_value('Дата рождения'))
            lactation_start = parse_date(get_value('Дата начала тек.лакт'))
            insemination_date = parse_date(get_value('Дата осеменения'))
            expected_calving = parse_date(get_value('Дата ожидаемого отела'))
            dry_date = parse_date(get_value('Дата запуска тек.лакт'))

            if birth_date and pd.notna(birth_date):
                age_days = (self.reference_date - birth_date).days
                age_years = age_days / 365.25
                log_age = np.log1p(max(age_days, 0))
                age_days_forecast = (future_date - birth_date).days
                age_years_forecast = age_days_forecast / 365.25
            else:
                age_days = 0
                age_years = 0
                log_age = 0
                age_days_forecast = 0
                age_years_forecast = 0

            if lactation_start and pd.notna(lactation_start):
                days_since_lactation = (self.reference_date - lactation_start).days
                log_lactation = np.log1p(max(days_since_lactation, 0))
                days_since_lactation_forecast = (future_date - lactation_start).days
            else:
                days_since_lactation = 0
                log_lactation = 0
                days_since_lactation_forecast = 0

            if insemination_date and pd.notna(insemination_date):
                days_since_insemination = (self.reference_date - insemination_date).days
                days_since_insemination_forecast = (future_date - insemination_date).days
            else:
                days_since_insemination = 0
                days_since_insemination_forecast = 0

            if expected_calving and pd.notna(expected_calving):
                days_to_calving = (expected_calving - self.reference_date).days
                days_to_calving_forecast = (expected_calving - future_date).days
            else:
                days_to_calving = 0
                days_to_calving_forecast = 0

            status_encoded = 0
            status = get_value('Статус коровы', 'Неизвестно')
            if status and status != 'Неизвестно' and 'Статус коровы' in self.label_encoders:
                try:
                    status_encoded = self.label_encoders['Статус коровы'].transform([str(status)])[0]
                except:
                    status_encoded = 0

            def safe_float(val, default=0.0):
                if val is None or pd.isna(val):
                    return default
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return default

            feature_map = {
                'Лактация': safe_float(get_value('Лактация')),
                'возраст_дни': age_days,
                'возраст_годы': age_years,
                'логарифм_возраста': log_age,
                'дни_с_начала_лакт': days_since_lactation,
                'логарифм_дней_лактации': log_lactation,
                'дни_с_осеменения': days_since_insemination,
                'дни_до_отела': days_to_calving,
                'Дни стельности': safe_float(get_value('Дни стельности')),
                'возраст_дни_прогноз': age_days_forecast,
                'возраст_годы_прогноз': age_years_forecast,
                'дни_с_начала_лакт_прогноз': days_since_lactation_forecast,
                'дни_с_осеменения_прогноз': days_since_insemination_forecast,
                'дни_до_отела_прогноз': days_to_calving_forecast,
                'Статус коровы_encoded': status_encoded,
                'Порода_encoded': 0,
                'Кличка животного_encoded': 0
            }

            features = []
            for col in self.feature_columns:
                if col in feature_map:
                    features.append(feature_map[col])
                else:
                    features.append(0.0)

            features_array = np.array(features).reshape(1, -1)
            features_scaled = self.scaler.transform(features_array)

            prediction_norm = self.model.predict(features_scaled)[0]
            prediction = prediction_norm * self.y_std + self.y_mean

            if pd.notna(dry_date) and future_date > dry_date:
                if pd.notna(lactation_start):
                    actual_max_days = (dry_date - lactation_start).days
                    prediction = min(prediction, actual_max_days)

            if pd.notna(expected_calving) and future_date >= expected_calving:
                prediction = 0

            if self.model_metrics and 'mae' in self.model_metrics:
                confidence = max(0, min(100, 100 * (1 - self.model_metrics['mae'] / max(self.y_mean, 1))))
            else:
                confidence = 95.0

            current_milking_days = 0
            if lactation_start and pd.notna(lactation_start):
                if pd.notna(dry_date) and dry_date <= self.reference_date:
                    current_milking_days = (dry_date - lactation_start).days
                else:
                    current_milking_days = (self.reference_date - lactation_start).days

            forecast_horizon_days = (future_date - self.reference_date).days

            result = {
                'predicted_days': round(max(prediction, 0), 1),
                'current_days': round(current_milking_days, 1),
                'forecast_date': future_date.strftime('%d.%m.%Y'),
                'forecast_horizon_days': forecast_horizon_days,
                'confidence': round(confidence, 1),
                'model_metrics': {
                    'mae': round(self.model_metrics.get('mae', 0), 1),
                    'mape': round(self.model_metrics.get('mape', 0), 1),
                    'r2': round(self.model_metrics.get('r2', 0), 3),
                    'y_mean': round(self.y_mean, 1),
                    'reference_date': self.model_metrics.get('reference_date', '')
                }
            }

            return result

        except Exception as e:
            logger.error(f"Ошибка при предсказании: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}

    def get_herd_summary(self, target_date_str=None, dataset_name=None):
        if self.all_cows is None or self.all_cows.empty:
            return {"error": "Данные не загружены"}

        if target_date_str:
            target_date = pd.to_datetime(target_date_str, format='%d.%m.%Y')
        else:
            target_date = self.reference_date

        logger.info(f"Расчет сводки для стада на дату: {target_date.strftime('%d.%m.%Y')} (датасет: {dataset_name or 'все'})")

        df = self.all_cows.copy()
        df = self._filter_by_dataset(df, dataset_name)

        active_mask = (
            (df['Дата архива'].isna()) | (df['Дата архива'] > target_date)
        )

        df_active = df[active_mask].copy()
        logger.info(f"Найдено {len(df_active)} активных записей по дате архива")

        status_counts = df_active['Статус коровы'].value_counts().to_dict()

        animal_classes = {}
        for _, row in df_active.iterrows():
            animal_class = self.classify_animal(row)
            animal_classes[animal_class] = animal_classes.get(animal_class, 0) + 1

        milking_cows = df_active[
            df_active['Статус коровы'].str.contains('Дойная', na=False, case=False) &
            pd.isna(df_active['Дата запуска тек.лакт'])
        ]

        if not milking_cows.empty:
            milking_days = []
            for _, cow in milking_cows.iterrows():
                days = self.calculate_milking_days(cow, target_date)
                milking_days.append(days)
            avg_milking_days = np.mean(milking_days) if milking_days else 0
        else:
            avg_milking_days = 0

        pregnant_cows = df_active[
            df_active['Статус коровы'].str.contains('Стельная', na=False, case=False)
        ]

        service_periods = []
        for _, cow in pregnant_cows.iterrows():
            period = self.calculate_service_period(cow)
            if period is not None:
                service_periods.append(period)

        avg_service_period = np.mean(service_periods) if service_periods else 0
        normal_service_period_pct = sum(110 <= p <= 120 for p in service_periods) / len(service_periods) * 100 if service_periods else 0

        dry_cows = df_active[pd.notna(df_active['Дата запуска тек.лакт'])]

        expected_calvings = df_active[pd.notna(df_active['Дата ожидаемого отела'])]
        calvings_next_month = len(expected_calvings[
            (expected_calvings['Дата ожидаемого отела'] >= target_date) &
            (expected_calvings['Дата ожидаемого отела'] <= target_date + timedelta(days=30))
        ])

        ideal_cows = []
        for cow_id in df_active['Номер животного'].unique():
            if self.check_ideal_cow(cow_id, dataset_name):
                ideal_cows.append(cow_id)

        summary = {
            'target_date': target_date.strftime('%d.%m.%Y'),
            'total_active_records': len(df_active),
            'animal_classes': animal_classes,
            'status_distribution': status_counts,
            'avg_milking_days_dairy': round(avg_milking_days, 1),
            'avg_service_period': round(avg_service_period, 1),
            'normal_service_period_percentage': round(normal_service_period_pct, 1),
            'dairy_cows_count': len(milking_cows),
            'dry_cows_count': len(dry_cows),
            'pregnant_cows_count': len(pregnant_cows),
            'expected_calvings_next_month': calvings_next_month,
            'ideal_cows_count': len(ideal_cows),
            'ideal_cows_list': ideal_cows[:10],
            'dataset_filter': dataset_name or 'all'
        }

        logger.info(f"Сводка рассчитана")
        return summary

    def get_historical_summary(self, period='month', dataset_name=None):
        if self.all_cows is None or self.all_cows.empty:
            return {"error": "Данные не загружены"}

        try:
            df = self.all_cows.copy()
            df = self._filter_by_dataset(df, dataset_name)

            if period == 'month':
                start_date = self.reference_date - timedelta(days=30)
                period_name = "последний месяц"
            elif period == 'year':
                start_date = self.reference_date - timedelta(days=365)
                period_name = "последний год"
            else:
                return {"error": "Неверный период. Используйте 'month' или 'year'"}

            mask = (
                (df['Дата архива'].isna()) | (df['Дата архива'] > start_date)
            ) & (
                (df['Дата рождения'] <= self.reference_date)
            )

            df_period = df[mask].copy()

            initial_count = len(df[df['Дата рождения'] <= start_date])
            final_count = len(df_period)

            new_cows = final_count - initial_count if final_count > initial_count else 0

            milking_cows_start = len(df[(df['Дата рождения'] <= start_date) &
                                       (df['Статус коровы'].str.contains('Дойная', na=False, case=False)) &
                                       pd.isna(df['Дата запуска тек.лакт'])])
            milking_cows_end = len(df_period[df_period['Статус коровы'].str.contains('Дойная', na=False, case=False) &
                                           pd.isna(df_period['Дата запуска тек.лакт'])])

            milk_cows_change = milking_cows_end - milking_cows_start

            births = len(df[(df['Дата рождения'] > start_date) &
                           (df['Дата рождения'] <= self.reference_date)])

            calvings = len(df[(df['Дата начала тек.лакт'] > start_date) &
                             (df['Дата начала тек.лакт'] <= self.reference_date)])

            milking_days_list = []
            for _, cow in df_period.iterrows():
                if pd.notna(cow.get('Дата начала тек.лакт')):
                    days = self.calculate_milking_days(cow, self.reference_date)
                    milking_days_list.append(days)

            avg_milking_days = np.mean(milking_days_list) if milking_days_list else 0

            summary = {
                'period': period_name,
                'start_date': start_date.strftime('%d.%m.%Y'),
                'end_date': self.reference_date.strftime('%d.%m.%Y'),
                'total_cows_end': final_count,
                'new_cows': new_cows,
                'births': births,
                'calvings': calvings,
                'milk_cows_change': milk_cows_change,
                'avg_milking_days': round(avg_milking_days, 1),
                'status_distribution': df_period['Статус коровы'].value_counts().to_dict(),
                'dataset_filter': dataset_name or 'all'
            }

            logger.info(f"Историческая сводка за {period_name} рассчитана")
            return summary

        except Exception as e:
            logger.error(f"Ошибка при расчете исторической сводки: {e}")
            return {"error": str(e)}

    def save_model(self, path='models/'):
        if self.model is None:
            return False

        os.makedirs(path, exist_ok=True)

        try:
            joblib.dump(self.model, os.path.join(path, 'milking_model_monthly.pkl'))
            joblib.dump(self.scaler, os.path.join(path, 'scaler_monthly.pkl'))
            joblib.dump(self.label_encoders, os.path.join(path, 'label_encoders_monthly.pkl'))
            joblib.dump(self.feature_columns, os.path.join(path, 'feature_columns_monthly.pkl'))
            joblib.dump(self.model_metrics, os.path.join(path, 'model_metrics_monthly.pkl'))
            joblib.dump({'mean': self.y_mean, 'std': self.y_std, 'reference_date': self.reference_date, 'forecast_days': self.forecast_days},
                       os.path.join(path, 'y_scaler_monthly.pkl'))

            logger.info(f"Модель сохранена в {path}")
            return True

        except Exception as e:
            logger.error(f"Ошибка при сохранении модели: {e}")
            return False

    def load_model(self, path='models/'):
        try:
            self.model = joblib.load(os.path.join(path, 'milking_model_monthly.pkl'))
            self.scaler = joblib.load(os.path.join(path, 'scaler_monthly.pkl'))
            self.label_encoders = joblib.load(os.path.join(path, 'label_encoders_monthly.pkl'))
            self.feature_columns = joblib.load(os.path.join(path, 'feature_columns_monthly.pkl'))
            self.model_metrics = joblib.load(os.path.join(path, 'model_metrics_monthly.pkl'))

            y_scaler = joblib.load(os.path.join(path, 'y_scaler_monthly.pkl'))
            self.y_mean = y_scaler['mean']
            self.y_std = y_scaler['std']
            self.reference_date = y_scaler.get('reference_date', datetime.now())
            self.forecast_days = y_scaler.get('forecast_days', 30)

            logger.info("Модель загружена")
            return True

        except FileNotFoundError:
            logger.warning("Сохраненная модель не найдена, нужно обучить новую")
            return False
        except Exception as e:
            logger.error(f"Ошибка при загрузке модели: {e}")
            return False

    def get_cow_ids(self, dataset_name=None):
        if self.all_cows is None or self.all_cows.empty:
            return []

        try:
            df = self._filter_by_dataset(self.all_cows, dataset_name)
            cow_ids = df['Номер животного'].astype(str).unique().tolist()
            return sorted(cow_ids)
        except Exception as e:
            logger.error(f"Ошибка при получении списка ID: {e}")
            return []

    def get_cow_info(self, cow_id, dataset_name=None):
        if self.all_cows is None or self.all_cows.empty:
            return None

        try:
            df = self._filter_by_dataset(self.all_cows, dataset_name)
            cow_data = df[df['Номер животного'].astype(str) == str(cow_id)]

            if cow_data.empty:
                return None

            return cow_data.iloc[0].copy()
        except Exception as e:
            logger.error(f"Ошибка при получении информации о корове {cow_id}: {e}")
            return None

    def _get_latest_records(self, df):
        if df.empty:
            return df

        df_sorted = df.sort_values(
            by=['Лактация', 'Дата начала тек.лакт'],
            ascending=[False, False],
            na_position='last'
        )
        latest = df_sorted.groupby('Номер животного', as_index=False).first()
        return latest

    def _prepare_prediction_features(self, df, target_date):
        if df.empty:
            return pd.DataFrame()

        data = df.copy()

        birth = data['Дата рождения']
        age_days = (self.reference_date - birth).dt.days.fillna(0)
        age_years = age_days / 365.25
        log_age = np.log1p(age_days)

        age_days_forecast = (target_date - birth).dt.days.fillna(0)
        age_years_forecast = age_days_forecast / 365.25

        lact_start = data['Дата начала тек.лакт']
        days_since_lact = (self.reference_date - lact_start).dt.days.fillna(0)
        log_lact = np.log1p(days_since_lact)
        days_since_lact_forecast = (target_date - lact_start).dt.days.fillna(0)

        insem_date = data['Дата осеменения']
        days_since_insem = (self.reference_date - insem_date).dt.days.fillna(0)
        days_since_insem_forecast = (target_date - insem_date).dt.days.fillna(0)

        calving_date = data['Дата ожидаемого отела']
        days_to_calving = (calving_date - self.reference_date).dt.days.fillna(0)
        days_to_calving_forecast = (calving_date - target_date).dt.days.fillna(0)

        status_enc = 0
        if 'Статус коровы' in data.columns and 'Статус коровы' in self.label_encoders:
            status_series = data['Статус коровы'].fillna('Неизвестно').astype(str)
            try:
                status_enc = self.label_encoders['Статус коровы'].transform(status_series)
            except:
                status_enc = 0

        breed_enc = 0
        name_enc = 0

        feature_map = {
            'Лактация': data['Лактация'].fillna(0),
            'возраст_дни': age_days,
            'возраст_годы': age_years,
            'логарифм_возраста': log_age,
            'дни_с_начала_лакт': days_since_lact,
            'логарифм_дней_лактации': log_lact,
            'дни_с_осеменения': days_since_insem,
            'дни_до_отела': days_to_calving,
            'Дни стельности': data['Дни стельности'].fillna(0),
            'возраст_дни_прогноз': age_days_forecast,
            'возраст_годы_прогноз': age_years_forecast,
            'дни_с_начала_лакт_прогноз': days_since_lact_forecast,
            'дни_с_осеменения_прогноз': days_since_insem_forecast,
            'дни_до_отела_прогноз': days_to_calving_forecast,
            'Статус коровы_encoded': status_enc,
            'Порода_encoded': breed_enc,
            'Кличка животного_encoded': name_enc
        }

        features = pd.DataFrame()
        for col in self.feature_columns:
            if col in feature_map:
                features[col] = feature_map[col]
            else:
                features[col] = 0.0

        features_scaled = self.scaler.transform(features)
        return features_scaled

    def predict_for_all_cows(self, dataset=None, status=None, lactation_min=None,
                              lactation_max=None, cow_ids=None, target_date=None,
                              limit=100, offset=0, sort_by='cow_id', sort_order='asc'):
        if self.all_cows.empty:
            return {'error': 'Данные не загружены'}

        df = self._filter_by_dataset(self.all_cows, dataset)

        if status:
            status_list = [s.strip() for s in status.split(',')]
            pattern = '|'.join(status_list)
            df = df[df['Статус коровы'].str.contains(pattern, na=False, case=False)]

        if lactation_min is not None:
            df = df[df['Лактация'] >= lactation_min]
        if lactation_max is not None:
            df = df[df['Лактация'] <= lactation_max]

        if cow_ids:
            ids_list = [str(id_.strip()) for id_ in cow_ids.split(',')]
            df = df[df['Номер животного'].astype(str).isin(ids_list)]

        if df.empty:
            return {'cows': [], 'total': 0, 'limit': limit, 'offset': offset}

        latest_df = self._get_latest_records(df)
        total = len(latest_df)

        if sort_by == 'cow_id':
            sort_col = 'Номер животного'
        elif sort_by == 'lactation':
            sort_col = 'Лактация'
        else:
            sort_col = 'Номер животного'

        ascending = (sort_order.lower() == 'asc')
        latest_df = latest_df.sort_values(by=sort_col, ascending=ascending)

        paginated_df = latest_df.iloc[offset:offset+limit].copy()

        if target_date:
            try:
                future_date = pd.to_datetime(target_date, format='%d.%m.%Y')
            except:
                future_date = self.reference_date + timedelta(days=self.forecast_days)
        else:
            future_date = self.reference_date + timedelta(days=self.forecast_days)

        if paginated_df.empty:
            features_scaled = np.array([])
        else:
            features_scaled = self._prepare_prediction_features(paginated_df, future_date)

        if self.model is not None and len(features_scaled) > 0:
            pred_norm = self.model.predict(features_scaled)
            pred_days = pred_norm * self.y_std + self.y_mean
            pred_days = np.maximum(pred_days, 0)
        else:
            pred_days = np.zeros(len(paginated_df))

        results = []
        for idx, (_, row) in enumerate(paginated_df.iterrows()):
            cow_id = str(row['Номер животного'])
            current_days = self.calculate_milking_days(row, self.reference_date)

            confidence = 95.0
            if self.model_metrics and 'mae' in self.model_metrics:
                confidence = max(0, min(100, 100 * (1 - self.model_metrics['mae'] / max(self.y_mean, 1))))

            cow_record = {
                'cow_id': cow_id,
                'name': row.get('Кличка животного', ''),
                'status': row.get('Статус коровы', ''),
                'lactation': int(row['Лактация']) if pd.notna(row['Лактация']) else None,
                'current_milking_days': round(current_days, 1),
                'predicted_milking_days': round(pred_days[idx], 1) if idx < len(pred_days) else None,
                'forecast_date': future_date.strftime('%d.%m.%Y'),
                'confidence': round(confidence, 1)
            }
            results.append(cow_record)

        if sort_by in ['predicted_days', 'current_days']:
            reverse = (sort_order.lower() == 'desc')
            results.sort(key=lambda x: x.get(sort_by, 0), reverse=reverse)

        return {
            'cows': results,
            'total': total,
            'limit': limit,
            'offset': offset,
            'sort_by': sort_by,
            'sort_order': sort_order,
            'filters': {
                'dataset': dataset,
                'status': status,
                'lactation_min': lactation_min,
                'lactation_max': lactation_max,
                'cow_ids': cow_ids,
                'target_date': future_date.strftime('%d.%m.%Y')
            }
        }

    def forecast_herd_milk_days(self, years=3, start_date=None,
                                  service_period=115, gestation=280, dry_period=60,
                                  max_lactations=5, heifer_age_first_service=380,
                                  purchase_rate=0.0, dataset_name=None,
                                  service_period_std=10, gestation_std=5,
                                  heifer_age_std=30, lactation_length_std=10):
        if self.all_cows.empty:
            return {"error": "Данные не загружены"}

        df = self._filter_by_dataset(self.all_cows, dataset_name)
        if df.empty:
            return {"error": f"Нет данных для датасета {dataset_name}"}

        if start_date is None:
            start_date = self.reference_date
        else:
            start_date = pd.to_datetime(start_date, format='%d.%m.%Y')

        population = self._init_population(start_date, df, heifer_age_first_service, heifer_age_std)

        end_date = start_date + timedelta(days=years*365)
        current = self._next_first_of_month(start_date)
        dates = []
        while current <= end_date:
            dates.append(current)
            if current.month == 12:
                current = current.replace(year=current.year+1, month=1)
            else:
                current = current.replace(month=current.month+1)

        results = []
        sim_date = start_date
        for target_date in dates:
            self._simulate_period(population, sim_date, target_date,
                                  service_period, gestation, dry_period,
                                  max_lactations, heifer_age_first_service,
                                  purchase_rate,
                                  service_period_std, gestation_std,
                                  heifer_age_std, lactation_length_std)
            avg, count = self._calc_avg_milk_days(population, target_date)
            results.append({
                'date': target_date.strftime('%d.%m.%Y'),
                'avg_milk_days': round(avg, 2),
                'dairy_cows': count
            })
            sim_date = target_date

        return results

    def _next_first_of_month(self, date):
        if date.month == 12:
            return date.replace(year=date.year+1, month=1, day=1)
        else:
            return date.replace(month=date.month+1, day=1)

    def _init_population(self, ref_date, df=None, heifer_age_mean=None, heifer_age_std=None):
        if df is None:
            df = self.all_cows

        latest = self._get_latest_records(df)
        population = []

        for _, row in latest.iterrows():
            archive_date = row.get('Дата архива')
            status = row.get('Статус коровы', '')
            if pd.notna(archive_date) and archive_date <= ref_date:
                continue
            if pd.isna(archive_date) and isinstance(status, str):
                if any(x in status for x in ['Продана', 'Мертвое', 'Брак']):
                    continue

            animal = {
                'id': row['Номер животного'],
                'birth_date': row['Дата рождения'] if pd.notna(row['Дата рождения']) else None,
                'type': self.classify_animal(row),
                'lactation': row['Лактация'] if pd.notna(row['Лактация']) else 0,
                'last_calving': row['Дата начала тек.лакт'] if pd.notna(row['Дата начала тек.лакт']) else None,
                'dry_date': row['Дата запуска тек.лакт'] if pd.notna(row['Дата запуска тек.лакт']) else None,
                'next_calving': row['Дата ожидаемого отела'] if pd.notna(row['Дата ожидаемого отела']) else None,
                'insemination_date': row['Дата успешного осеменения'] if pd.notna(row['Дата успешного осеменения']) else None,
                'status': row['Статус коровы'] if pd.notna(row['Статус коровы']) else 'Неизвестно',
                'removed': False
            }

            if animal['last_calving'] is not None and animal['next_calving'] is not None:
                if animal['last_calving'] > animal['next_calving']:
                    animal['next_calving'] = None

            if animal['type'] == 'Корова' and animal['lactation'] == 0:
                if animal['next_calving'] is not None:
                    animal['type'] = 'Нетель'
            elif animal['type'] == 'Телка' and animal['next_calving'] is not None:
                animal['type'] = 'Нетель'

            if animal['type'] == 'Нетель':
                if animal['next_calving'] is None and animal['insemination_date'] is not None:
                    animal['next_calving'] = animal['insemination_date'] + timedelta(days=280)

            if animal['type'] == 'Корова' and animal['next_calving'] is None and animal['insemination_date'] is not None:
                animal['next_calving'] = animal['insemination_date'] + timedelta(days=280)

            if animal['type'] == 'Телка' and heifer_age_mean is not None and heifer_age_std is not None:
                target_age = int(heifer_age_mean + np.random.normal(0, heifer_age_std))
                target_age = max(300, min(500, target_age))
                animal['target_insem_age'] = target_age

            population.append(animal)

        logger.info(f"Инициализировано {len(population)} животных на {ref_date.strftime('%d.%m.%Y')}")
        return population

    def _simulate_period(self, population, start_date, end_date,
                         service_period, gestation, dry_period,
                         max_lactations, heifer_age_first_service,
                         purchase_rate,
                         service_period_std, gestation_std,
                         heifer_age_std, lactation_length_std):
        current = start_date + timedelta(days=1)
        while current <= end_date:
            self._process_day(population, current,
                              service_period, gestation, dry_period,
                              max_lactations, heifer_age_first_service,
                              purchase_rate,
                              service_period_std, gestation_std,
                              heifer_age_std, lactation_length_std)
            current += timedelta(days=1)

    def _ensure_sufficient_heifers(self, population, date,
                                   service_period, gestation, dry_period,
                                   max_lactations, heifer_age_first_service,
                                   service_period_std, gestation_std,
                                   heifer_age_std, lactation_length_std):
        dairy_count = 0
        for animal in population:
            if animal.get('removed', False):
                continue
            if animal['type'] != 'Корова':
                continue
            last_calving = animal.get('last_calving')
            if last_calving is None:
                continue
            dry_date = animal.get('dry_date')
            if dry_date is not None and dry_date <= date:
                continue
            days = (date - last_calving).days
            if days >= 0:
                dairy_count += 1

        expected_heifers = 0
        next_year_start = date + timedelta(days=1)
        next_year_end = date + timedelta(days=365)
        for animal in population:
            if animal.get('removed', False):
                continue
            if animal['type'] == 'Нетель' and animal.get('next_calving') is not None:
                if next_year_start <= animal['next_calving'] <= next_year_end:
                    expected_heifers += 1

        needed = max(0, int(0.3 * dairy_count) - expected_heifers)
        if needed > 0:
            logger.info(f"{date.strftime('%d.%m.%Y')}: добавлено {needed} собственных нетелей для компенсации (30% от {dairy_count})")
            for i in range(needed):
                calving_offset = np.random.randint(0, 365)
                calving_date = next_year_start + timedelta(days=calving_offset)
                insem_date = calving_date - timedelta(days=gestation)
                birth_date = calving_date - timedelta(days=730)
                heifer = {
                    'id': f"internal_heifer_{date.strftime('%Y%m%d')}_{i}",
                    'birth_date': birth_date,
                    'type': 'Нетель',
                    'lactation': 0,
                    'last_calving': None,
                    'dry_date': None,
                    'next_calving': calving_date,
                    'insemination_date': insem_date,
                    'status': 'Нетель',
                    'removed': False
                }
                population.append(heifer)

    def _process_day(self, population, date,
                     service_period, gestation, dry_period,
                     max_lactations, heifer_age_first_service,
                     purchase_rate,
                     service_period_std, gestation_std,
                     heifer_age_std, lactation_length_std):
        if date.month == 1 and date.day == 1 and purchase_rate > 0:
            self._add_purchased_heifers(population, date, purchase_rate, gestation, dry_period)

        if date.month == 12 and date.day == 31:
            self._ensure_sufficient_heifers(population, date,
                                            service_period, gestation, dry_period,
                                            max_lactations, heifer_age_first_service,
                                            service_period_std, gestation_std,
                                            heifer_age_std, lactation_length_std)

        for animal in list(population):
            if animal.get('removed', False):
                continue

            daily_cull_prob = 0.30 / 365
            if animal['type'] == 'Корова' and np.random.random() < daily_cull_prob:
                animal['removed'] = True
                population.remove(animal)
                continue

            if animal['type'] == 'Телка' and animal['birth_date'] is not None:
                age_days = (date - animal['birth_date']).days
                target_age = animal.get('target_insem_age', heifer_age_first_service)
                if age_days >= target_age:
                    animal['type'] = 'Нетель'
                    animal['insemination_date'] = date
                    actual_gestation = int(gestation + np.random.normal(0, gestation_std))
                    actual_gestation = max(270, min(290, actual_gestation))
                    animal['next_calving'] = date + timedelta(days=actual_gestation)
                    continue

            if animal['type'] in ['Нетель', 'Корова'] and animal.get('next_calving') is not None:
                if animal['next_calving'] == date:
                    self._calving(animal, date, population, gestation, dry_period,
                                  max_lactations, service_period, service_period_std,
                                  gestation_std, lactation_length_std,
                                  heifer_age_first_service, heifer_age_std)
                    continue

            if animal['type'] == 'Корова' and animal.get('next_calving') is not None:
                dry_date = animal['next_calving'] - timedelta(days=dry_period)
                if dry_date == date:
                    animal['dry_date'] = date

            if animal['type'] == 'Корова' and animal.get('next_calving') is None:
                if animal.get('last_calving') is not None:
                    days_since_calving = (date - animal['last_calving']).days
                    if 50 <= days_since_calving <= 365:
                        if days_since_calving <= 200:
                            prob = 0.04
                        else:
                            prob = 0.04 * (1 - 0.75 * (days_since_calving - 200) / 165)
                        if np.random.random() < prob:
                            animal['insemination_date'] = date
                            actual_gestation = int(gestation + np.random.normal(0, gestation_std))
                            actual_gestation = max(270, min(290, actual_gestation))
                            animal['next_calving'] = date + timedelta(days=actual_gestation)
                            animal['dry_date'] = animal['next_calving'] - timedelta(days=dry_period)

            if animal['type'] == 'Корова' and animal.get('last_calving') is not None:
                days_since_calving = (date - animal['last_calving']).days
                if days_since_calving > 450 and animal.get('next_calving') is None:
                    animal['removed'] = True
                    population.remove(animal)
                    continue

    def _calving(self, animal, date, population, gestation, dry_period,
                 max_lactations, service_period, service_period_std,
                 gestation_std, lactation_length_std,
                 heifer_age_first_service, heifer_age_std):
        animal['dry_date'] = None
        animal['insemination_date'] = None
        animal['next_calving'] = None

        animal['last_calving'] = date
        if animal['type'] == 'Нетель':
            animal['type'] = 'Корова'
            animal['lactation'] = 1
        else:
            animal['lactation'] = animal.get('lactation', 0) + 1

        if np.random.random() < 0.5:
            calf = {
                'id': f"new_{len(population)+1}",
                'birth_date': date,
                'type': 'Телка',
                'lactation': 0,
                'last_calving': None,
                'dry_date': None,
                'next_calving': None,
                'insemination_date': None,
                'status': 'Телка',
                'removed': False
            }
            target_age = int(heifer_age_first_service + np.random.normal(0, heifer_age_std))
            target_age = max(300, min(500, target_age))
            calf['target_insem_age'] = target_age
            population.append(calf)

        if animal['lactation'] < max_lactations:
            target_sp = int(service_period + np.random.normal(0, service_period_std))
            target_sp = max(50, min(200, target_sp))
            animal['target_service_period'] = target_sp

    def _add_purchased_heifers(self, population, date, count, gestation, dry_period):
        for i in range(int(count)):
            offset = np.random.randint(-15, 16)
            calving_date = date + timedelta(days=60 + offset)
            heifer = {
                'id': f"purchased_{date.strftime('%Y%m%d')}_{i}",
                'birth_date': date - timedelta(days=730),
                'type': 'Нетель',
                'lactation': 0,
                'last_calving': None,
                'dry_date': None,
                'next_calving': calving_date,
                'insemination_date': calving_date - timedelta(days=gestation),
                'status': 'Нетель',
                'removed': False
            }
            population.append(heifer)

    def _calc_avg_milk_days(self, population, date):
        total_days = 0
        dairy_count = 0
        for animal in population:
            if animal.get('removed', False):
                continue
            if animal['type'] != 'Корова':
                continue
            last_calving = animal.get('last_calving')
            if last_calving is None:
                continue
            dry_date = animal.get('dry_date')
            if dry_date is not None and dry_date <= date:
                continue
            days = (date - last_calving).days
            if days >= 0:
                total_days += days
                dairy_count += 1
        avg = total_days / dairy_count if dairy_count > 0 else 0
        return avg, dairy_count

if __name__ == '__main__':
    analyzer = CattleAnalyzer()
    summary = analyzer.get_herd_summary()
    print("Сводка на текущую дату:", summary)

    month_summary = analyzer.get_historical_summary('month')
    print("\nСводка за месяц:", month_summary)

    year_summary = analyzer.get_historical_summary('year')
    print("\nСводка за год:", year_summary)

    if analyzer.model:
        print("\nПример прогноза для первой коровы:")
        first_cow = analyzer.all_cows.iloc[0].to_dict()
        prediction = analyzer.predict_milking_days_monthly(first_cow)
        print(prediction)

    forecast = analyzer.forecast_herd_milk_days(years=1)
    print("\nПрогноз средних дней доения на 1 год:")
    for f in forecast:
        print(f"{f['date']}: {f['avg_milk_days']} дней ({f['dairy_cows']} коров)")