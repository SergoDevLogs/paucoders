#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Flask, request, jsonify
from cattle_analyzer import CattleAnalyzer
import os
import logging
import pandas as pd
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
analyzer = None

def initialize_analyzer():
    global analyzer
    data_dir = os.path.join(os.path.dirname(__file__), '.')
    analyzer = CattleAnalyzer(data_dir=data_dir)
    
    if not analyzer.load_model():
        logger.info("Сохраненная модель не найдена, обучаем новую...")
        if analyzer.train_model():
            logger.info("Модель успешно обучена!")
        else:
            logger.error("Не удалось обучить модель")

initialize_analyzer()

@app.route('/health', methods=['GET'])
def health_check():
    status = {
        'status': 'ok' if analyzer and not analyzer.all_cows.empty else 'degraded',
        'model_trained': analyzer.model is not None,
        'reference_date': analyzer.reference_date.strftime('%d.%m.%Y') if analyzer.reference_date else None,
        'total_active_records': len(analyzer.all_cows) if analyzer.all_cows is not None else 0,
        'datasets': analyzer.get_datasets() if analyzer else [],
        'timestamp': datetime.now().isoformat()
    }
    http_code = 200 if analyzer and not analyzer.all_cows.empty else 503
    return jsonify(status), http_code

@app.route('/info', methods=['GET'])
def info():
    if analyzer is None:
        return jsonify({'error': 'Analyzer not initialized'}), 503

    info_data = {
        'service_name': 'Cattle Herd Analyzer with ML - Monthly Forecast',
        'total_records': len(analyzer.all_cows) if analyzer.all_cows is not None else 0,
        'model_trained': analyzer.model is not None,
        'reference_date': analyzer.reference_date.strftime('%d.%m.%Y') if analyzer.reference_date else None,
        'features_used': analyzer.feature_columns,
        'model_metrics': analyzer.model_metrics,
        'forecast_horizon': f'{analyzer.forecast_days} days',
        'data_sources': analyzer.get_datasets() if analyzer else []
    }
    return jsonify(info_data)

@app.route('/api/datasets', methods=['GET'])
def get_datasets():
    """Возвращает список доступных датасетов"""
    if analyzer is None:
        return jsonify({'error': 'Analyzer not initialized'}), 503
    return jsonify({
        'success': True,
        'datasets': analyzer.get_datasets()
    })

@app.route('/api/train', methods=['POST'])
def train_model():
    if analyzer is None:
        return jsonify({'error': 'Analyzer not initialized'}), 503
    
    try:
        success = analyzer.train_model()
        if success:
            return jsonify({
                'success': True,
                'message': 'Модель успешно обучена',
                'metrics': analyzer.model_metrics
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Не удалось обучить модель'
            }), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/predict', methods=['POST'])
def predict():
    if analyzer is None or analyzer.model is None:
        return jsonify({
            'error': 'Модель не обучена. Сначала обучите модель через /api/train'
        }), 503

    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        cow_data = data.get('cow_data', {})
        target_date = data.get('target_date')
        dataset_name = data.get('dataset')
        
        prediction = analyzer.predict_milking_days_monthly(cow_data, target_date=target_date, dataset_name=dataset_name)
        
        if 'error' in prediction:
            return jsonify(prediction), 400
        
        return jsonify({
            'success': True,
            'prediction': prediction
        })

    except Exception as e:
        logger.error(f"Ошибка при предсказании: {e}", exc_info=True)
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

@app.route('/api/predict/batch', methods=['POST'])
def predict_batch():
    if analyzer is None or analyzer.model is None:
        return jsonify({'error': 'Model not trained'}), 503

    try:
        data = request.get_json()
        cows = data.get('cows', [])
        target_date = data.get('target_date')
        dataset_name = data.get('dataset')
        
        results = []
        for cow in cows:
            pred = analyzer.predict_milking_days_monthly(cow, target_date=target_date, dataset_name=dataset_name)
            results.append({
                'cow_id': cow.get('Номер животного'),
                'prediction': pred
            })
        
        return jsonify({
            'success': True,
            'results': results
        })

    except Exception as e:
        logger.error(f"Ошибка в batch prediction: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/herd-summary', methods=['POST'])
def get_herd_summary():
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503

    try:
        data = request.get_json() or {}
        target_date = data.get('target_date')
        dataset_name = data.get('dataset')
        
        summary = analyzer.get_herd_summary(target_date, dataset_name)
        
        if 'error' in summary:
            return jsonify(summary), 500
            
        return jsonify({
            'success': True,
            'data': summary
        })

    except Exception as e:
        logger.error(f"Ошибка при получении сводки: {e}", exc_info=True)
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

@app.route('/api/herd-summary/current', methods=['GET'])
def get_current_herd_summary():
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503

    try:
        dataset_name = request.args.get('dataset')
        summary = analyzer.get_herd_summary(dataset_name=dataset_name)
        
        if 'error' in summary:
            return jsonify(summary), 500
            
        return jsonify({
            'success': True,
            'data': summary
        })

    except Exception as e:
        logger.error(f"Ошибка при получении сводки: {e}", exc_info=True)
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

@app.route('/api/historical-summary/<period>', methods=['GET'])
def get_historical_summary(period):
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503

    try:
        if period not in ['month', 'year']:
            return jsonify({'error': 'Period must be "month" or "year"'}), 400
        
        dataset_name = request.args.get('dataset')
        summary = analyzer.get_historical_summary(period, dataset_name)
        
        if 'error' in summary:
            return jsonify(summary), 500
            
        return jsonify({
            'success': True,
            'data': summary
        })

    except Exception as e:
        logger.error(f"Ошибка при получении исторической сводки: {e}", exc_info=True)
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

@app.route('/api/cow/<int:cow_id>', methods=['GET'])
def get_cow_info(cow_id):
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503

    try:
        dataset_name = request.args.get('dataset')
        cow_record = analyzer.get_cow_info(str(cow_id), dataset_name)
        
        if cow_record is None:
            return jsonify({'error': f'Cow with id {cow_id} not found in the specified dataset'}), 404

        animal_class = analyzer.classify_animal(cow_record)
        cow_record['animal_class'] = animal_class
        
        current_milking_days = analyzer.calculate_milking_days(cow_record, analyzer.reference_date)
        cow_record['current_milking_days'] = round(current_milking_days, 1)
        
        service_period = analyzer.calculate_service_period(cow_record)
        cow_record['service_period'] = round(service_period, 1) if service_period else None
        
        if analyzer.model is not None:
            prediction = analyzer.predict_milking_days_monthly(cow_record.to_dict())
            cow_record['predicted_milking_days_month'] = prediction.get('predicted_days')
            cow_record['prediction_confidence'] = prediction.get('confidence')
        
        is_ideal = analyzer.check_ideal_cow(str(cow_id), dataset_name)
        cow_record['is_ideal_cow'] = is_ideal

        for col in cow_record.index:
            if isinstance(cow_record[col], pd.Timestamp):
                cow_record[col] = cow_record[col].strftime('%d.%m.%Y') if pd.notna(cow_record[col]) else None
            elif pd.isna(cow_record[col]):
                cow_record[col] = None

        return jsonify({
            'success': True, 
            'data': cow_record.to_dict()
        })

    except Exception as e:
        logger.error(f"Ошибка при поиске коровы {cow_id}: {e}", exc_info=True)
        return jsonify({'error': f'Search failed: {str(e)}'}), 500

@app.route('/api/cows/ids', methods=['GET'])
def get_cow_ids():
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503
    
    try:
        dataset_name = request.args.get('dataset')
        cow_ids = analyzer.get_cow_ids(dataset_name)
        return jsonify({
            'success': True,
            'count': len(cow_ids),
            'ids': cow_ids[:100]
        })
    except Exception as e:
        logger.error(f"Ошибка при получении списка ID: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/cows/statistics', methods=['GET'])
def get_cows_statistics():
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503
    
    try:
        dataset_name = request.args.get('dataset')
        df = analyzer._filter_by_dataset(analyzer.all_cows, dataset_name)
        
        animal_classes = {}
        for _, row in df.iterrows():
            animal_class = analyzer.classify_animal(row)
            animal_classes[animal_class] = animal_classes.get(animal_class, 0) + 1
        
        ideal_cows = []
        for cow_id in df['Номер животного'].unique():
            if analyzer.check_ideal_cow(cow_id, dataset_name):
                ideal_cows.append(cow_id)
        
        pregnant_cows = df[df['Статус коровы'].str.contains('Стельная', na=False, case=False)]
        service_periods = []
        for _, cow in pregnant_cows.iterrows():
            period = analyzer.calculate_service_period(cow)
            if period is not None:
                service_periods.append(period)
        
        stats = {
            'total_cows': len(df),
            'animal_classes': animal_classes,
            'ideal_cows_count': len(ideal_cows),
            'avg_service_period': round(np.mean(service_periods), 1) if service_periods else 0,
            'service_period_std': round(np.std(service_periods), 1) if service_periods else 0,
            'normal_service_period_percentage': round(sum(110 <= p <= 120 for p in service_periods) / len(service_periods) * 100, 1) if service_periods else 0,
            'dataset_filter': dataset_name or 'all'
        }
        
        return jsonify({
            'success': True,
            'statistics': stats
        })
    except Exception as e:
        logger.error(f"Ошибка при получении статистики: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/cows/ideal', methods=['GET'])
def get_ideal_cows():
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503
    
    try:
        limit = request.args.get('limit', default=20, type=int)
        dataset_name = request.args.get('dataset')
        
        df = analyzer._filter_by_dataset(analyzer.all_cows, dataset_name)
        
        ideal_cows = []
        for cow_id in df['Номер животного'].unique():
            if analyzer.check_ideal_cow(cow_id, dataset_name):
                cow_data = df[df['Номер животного'] == cow_id].iloc[0]
                ideal_cows.append({
                    'id': cow_id,
                    'name': cow_data.get('Кличка животного'),
                    'lactation': cow_data.get('Лактация')
                })
            
            if len(ideal_cows) >= limit:
                break
        
        return jsonify({
            'success': True,
            'count': len(ideal_cows),
            'ideal_cows': ideal_cows,
            'dataset_filter': dataset_name or 'all'
        })
    except Exception as e:
        logger.error(f"Ошибка при поиске идеальных коров: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/forecast/horizon', methods=['POST'])
def set_forecast_horizon():
    if analyzer is None:
        return jsonify({'error': 'Analyzer not initialized'}), 503
    
    try:
        data = request.get_json()
        days = data.get('days', 30)
        
        if days < 1 or days > 365:
            return jsonify({'error': 'Days must be between 1 and 365'}), 400
        
        analyzer.forecast_days = days
        analyzer.prepare_features()
        
        return jsonify({
            'success': True,
            'message': f'Forecast horizon set to {days} days',
            'forecast_horizon': days
        })
    except Exception as e:
        logger.error(f"Ошибка при установке горизонта прогноза: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/cows/predictions', methods=['GET'])
def get_cows_predictions():
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503

    try:
        dataset = request.args.get('dataset')
        status = request.args.get('status')
        lactation_min = request.args.get('lactation_min', type=int)
        lactation_max = request.args.get('lactation_max', type=int)
        cow_ids = request.args.get('cow_ids')
        target_date = request.args.get('target_date')
        limit = request.args.get('limit', default=100, type=int)
        offset = request.args.get('offset', default=0, type=int)
        sort_by = request.args.get('sort_by', default='cow_id')
        sort_order = request.args.get('sort_order', default='asc')

        result = analyzer.predict_for_all_cows(
            dataset=dataset,
            status=status,
            lactation_min=lactation_min,
            lactation_max=lactation_max,
            cow_ids=cow_ids,
            target_date=target_date,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order
        )

        if 'error' in result:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        logger.error(f"Ошибка в /api/cows/predictions: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/forecast/herd', methods=['POST'])
def forecast_herd():
    if analyzer is None or analyzer.all_cows.empty:
        return jsonify({'error': 'Data not loaded'}), 503

    try:
        data = request.get_json() or {}
        years = data.get('years', 3)
        start_date = data.get('start_date')
        service_period = data.get('service_period', 115)
        gestation = data.get('gestation', 280)
        dry_period = data.get('dry_period', 60)
        max_lactations = data.get('max_lactations', 5)
        heifer_age_first_service = data.get('heifer_age_first_service', 380)
        purchase_rate = data.get('purchase_rate', 0.0)
        dataset_name = data.get('dataset')

        forecast = analyzer.forecast_herd_milk_days(
            years=years,
            start_date=start_date,
            service_period=service_period,
            gestation=gestation,
            dry_period=dry_period,
            max_lactations=max_lactations,
            heifer_age_first_service=heifer_age_first_service,
            purchase_rate=purchase_rate,
            dataset_name=dataset_name
        )

        if isinstance(forecast, dict) and 'error' in forecast:
            return jsonify(forecast), 500

        return jsonify({
            'success': True,
            'forecast': forecast
        })

    except Exception as e:
        logger.error(f"Ошибка в forecast_herd: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info(" Запуск Cattle Herd Analyzer ML сервиса с поддержкой множества датасетов...")
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False,
        threaded=True
    )