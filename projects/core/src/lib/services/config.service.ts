import { Injectable } from '@angular/core';
import { environment } from '../config/environment';
import { Environment } from '../config/environment.interface';

@Injectable({
    providedIn: 'root'
})
export class ConfigService {
    private readonly config: Environment = environment;

    get production(): boolean {
        return this.config.production;
    }

    get apiUrl(): string {
        return this.config.API_URL;
    }

    get apiTimeout(): number {
        return this.config.apiTimeout;
    }

    get enableLogging(): boolean {
        return this.config.enableLogging;
    }

    getApiEndpoint(path: string): string {
        return `${this.apiUrl}/${path}`;
    }
}
