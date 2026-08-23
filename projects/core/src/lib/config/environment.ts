import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  API_URL: 'https://app.wsnori.com/api',
  apiTimeout: 30000,
  enableLogging: true,
};
