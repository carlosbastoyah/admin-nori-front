import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  API_URL: 'https://dev.werclinical.com:8080/api',
  apiTimeout: 30000,
  enableLogging: true,
};
