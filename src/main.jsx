import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as wjCore from '@mescius/wijmo';
// Wijmo 한국어 문화권: 컨트롤이 생성되기 전에(= App import 전에) 적용되어야 합니다.
import '@mescius/wijmo.cultures/wijmo.culture.ko';
import '@mescius/wijmo.styles/wijmo.css';
import './styles.css';
import App from './App.jsx';

// 선택: .env 의 VITE_WIJMO_LICENSE_KEY 가 있으면 라이선스 키를 적용합니다.
// const licenseKey = import.meta.env.VITE_WIJMO_LICENSE_KEY;
// if (licenseKey) wjCore.setLicenseKey(licenseKey);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
