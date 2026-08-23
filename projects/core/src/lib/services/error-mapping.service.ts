import { Injectable } from '@angular/core';
import { ApiError } from '../models/api-error';

const CODE_MESSAGES: Record<string, string> = {
    BAD_REQUEST: 'Solicitud inválida. Verifica los datos.',
    INVALID_ID: 'Identificador inválido.',
    INVALID_CLIENT_ID: 'Cliente inválido.',
    INVALID_DATE_RANGE: 'Rango de fechas inválido.',
    INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos. Verifica tus datos.',
    INVALID_OR_EXPIRED_TOKEN: 'Sesión expirada o inválida. Inicia sesión de nuevo.',
    ACCESS_TOKEN_REQUIRED: 'Se requiere token de acceso.',
    TOKEN_REVOKED: 'Sesión cerrada. Inicia sesión de nuevo.',
    TENANT_REQUIRED: 'Falta identificar el cliente. Contacta a soporte.',
    TENANT_NOT_FOUND_OR_INACTIVE: 'Cliente no encontrado o inactivo.',
    NOT_FOUND: 'No encontrado.',
    CONFLICT: 'Conflicto: la operación no pudo completarse (por ejemplo, registro duplicado).',
    INTERNAL_ERROR: 'Error interno. Intenta más tarde o contacta a soporte.',
    ADMIN_API_KEY_MISSING_OR_INVALID: 'Acceso no autorizado.',
    NETWORK_ERROR: 'No se puede conectar con el servidor. Verifica tu conexión.',
    UNAUTHORIZED: 'No autorizado. Inicia sesión de nuevo.',
    FORBIDDEN: 'No tienes permiso para realizar esta acción.',
};

const FALLBACK_BY_STATUS: Record<number, string> = {
    400: 'Datos inválidos. Verifica e intenta de nuevo.',
    401: 'Sesión inválida. Inicia sesión de nuevo.',
    403: 'No tienes permiso para esta acción.',
    404: 'No encontrado.',
    409: 'Conflicto al guardar. Verifica los datos.',
    500: 'Error del servidor. Intenta más tarde.',
};

@Injectable({
    providedIn: 'root',
})
export class ErrorMappingService {
    /**
     * Returns a user-facing message for the given ApiError.
     * Prefers API detail when present; otherwise code map, then status-based fallback.
     * For INTERNAL_ERROR when using fallback, appends traceId when available for support.
     */
    getMessage(apiError: ApiError): string {
        if (apiError.detail && apiError.detail.trim().length > 0) {
            return apiError.detail;
        }
        const byCode = CODE_MESSAGES[apiError.code];
        if (byCode) {
            if (apiError.code === 'INTERNAL_ERROR' && apiError.traceId) {
                return `${byCode} Referencia: ${apiError.traceId}`;
            }
            return byCode;
        }
        return (
            FALLBACK_BY_STATUS[apiError.status] ??
            'Ocurrió un error. Intenta de nuevo.'
        );
    }
}
