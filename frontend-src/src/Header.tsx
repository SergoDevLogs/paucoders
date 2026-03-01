import './Header.css';

import spider from "./assets/spider.svg"
import profile  from "./assets/Group 3.svg"
import {Link} from "react-router-dom";

const Header = () => {
    return (
        <header className="auth-header">
            <div className="auth-header-content" >
                <img src={spider} alt="" className="logo"/>
                <div className="profile-wrapper">
                   <Link to='/profile'>
                       <img src={profile} alt="" className="profile-icon"/>
                   </Link>
                </div>
            </div>
        </header>
    );
};

export default Header;