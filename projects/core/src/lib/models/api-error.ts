import { HttpErrorResponse } from '@angular/common/http';
import { FormGroup } from '@angular/forms';

/**
 * Raw RFC 7807 Problem Details from the API.
 * Backend may send traceId, code, errors in body or under extensions (camelCase when serialized).
 */
export interface ProblemDetails {
    type?: string;
    title?: string;
    status?: number;
    detail?: string;
    instance?: string;
    traceId?: string;
    code?: string;
    errors?: ProblemDetailsValidationError[];
    extensions?: {
        traceId?: string;
        code?: string;
        errors?: ProblemDetailsValidationError[];
    };
}

export interface ProblemDetailsValidationError {
    propertyName: string;
    errorMessage: string;
}

/**
 * Normalized error shape used across the app after ErrorNormalizerInterceptor or normalizeHttpError.
 */
export interface ApiError {
    status: number;
    code: string;
    detail: string;
    traceId?: string;
    errors?: Record<string, string>;
    original?: HttpErrorResponse;
}

const DEFAULT_MESSAGES: Record<number, string> = {
    400: 'Solicitud inválida',
    401: 'No autorizado',
    403: 'Sin permiso',
    404: 'No encontrado',
    409: 'Conflicto',
    500: 'Error interno del servidor',
};

const DEFAULT_CODES: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    500: 'INTERNAL_ERROR',
};

function pascalToCamel(str: string): string {
    if (!str || str.length === 0) return str;
    return str.charAt(0).toLowerCase() + str.slice(1);
}

/** Reads a string property from body in either camelCase or PascalCase (e.g. .NET APIs). */
function getStringFromBody(body: Record<string, unknown>, key: string): string | undefined {
    const camel = body[key];
    if (typeof camel === 'string' && camel.length > 0) return camel;
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    const pascalVal = body[pascal];
    return typeof pascalVal === 'string' && pascalVal.length > 0 ? pascalVal : undefined;
}

function isProblemDetailsBody(body: unknown): body is Record<string, unknown> {
    if (!body || typeof body !== 'object') return false;
    const o = body as Record<string, unknown>;
    const status = o['status'];
    return (
        (typeof status === 'number' && status >= 400) ||
        typeof o['detail'] === 'string' ||
        typeof o['Detail'] === 'string' ||
        typeof o['title'] === 'string' ||
        typeof o['Title'] === 'string'
    );
}

function mapValidationErrors(
    errors: ProblemDetailsValidationError[] | undefined,
    toCamelCase: boolean
): Record<string, string> | undefined {
    if (!errors || !Array.isArray(errors) || errors.length === 0) return undefined;
    const map: Record<string, string> = {};
    for (const e of errors) {
        const key = toCamelCase ? pascalToCamel(e.propertyName) : e.propertyName;
        map[key] = e.errorMessage ?? '';
    }
    return map;
}

/**
 * Normalizes an HttpErrorResponse into a consistent ApiError.
 * Handles RFC 7807 bodies (detail, code, traceId, errors) and fallbacks by status.
 */
function parseErrorBody(error: unknown): unknown {
    if (typeof error === 'string' && error.trim().startsWith('{')) {
        try {
            return JSON.parse(error) as unknown;
        } catch {
            return error;
        }
    }
    return error;
}

export function normalizeHttpError(response: HttpErrorResponse): ApiError {
    const status = response.status ?? 0;
    const body = parseErrorBody(response.error);

    if (status === 0) {
        return {
            status: 0,
            code: 'NETWORK_ERROR',
            detail: 'No se puede conectar con el servidor. Verifica tu conexión.',
            original: response,
        };
    }

    if (isProblemDetailsBody(body)) {
        const ext = (body['extensions'] ?? body['Extensions']) as Record<string, unknown> | undefined;
        const code =
            getStringFromBody(body, 'code') ??
            (ext && getStringFromBody(ext, 'code')) ??
            getStringFromBody(body, 'title') ??
            DEFAULT_CODES[status] ??
            'UNKNOWN';
        const detail =
            getStringFromBody(body, 'detail') ??
            getStringFromBody(body, 'title') ??
            DEFAULT_MESSAGES[status] ??
            `Error del servidor: ${status}`;
        const traceId =
            getStringFromBody(body, 'traceId') ??
            (ext && getStringFromBody(ext, 'traceId'));
        const rawErrors = body['errors'] ?? body['Errors'] ?? ext?.['errors'] ?? ext?.['Errors'];
        const errors = mapValidationErrors(
            Array.isArray(rawErrors) ? rawErrors as ProblemDetailsValidationError[] : undefined,
            true
        );

        return {
            status,
            code: String(code),
            detail: String(detail),
            traceId: traceId == null || traceId === '' ? undefined : traceId,
            errors,
            original: response,
        };
    }

    const code = DEFAULT_CODES[status] ?? 'UNKNOWN';
    const detail =
        DEFAULT_MESSAGES[status] ??
        (response.message && response.message.length > 0 ? response.message : `Error: ${status}`);

    return {
        status,
        code,
        detail,
        original: response,
    };
}

/**
 * Type guard: value has ApiError shape (normalized error).
 */
export function isApiError(value: unknown): value is ApiError {
    if (!value || typeof value !== 'object') return false;
    const o = value as Record<string, unknown>;
    return (
        typeof o['status'] === 'number' &&
        typeof o['code'] === 'string' &&
        typeof o['detail'] === 'string'
    );
}

/**
 * Applies server validation errors to form controls.
 * Use when API returns 400 with errors array (propertyName → errorMessage).
 * nameMap maps backend property names (e.g. PascalCase) to form control names (e.g. camelCase).
 */
export function applyValidationErrors(
    form: FormGroup,
    errors: Record<string, string>,
    nameMap?: Record<string, string>
): void {
    if (!errors || Object.keys(errors).length === 0) return;

    for (const [key, message] of Object.entries(errors)) {
        const controlName = nameMap?.[key] ?? key;
        const control = form.get(controlName);
        if (control) {
            const existing = control.errors ?? {};
            control.setErrors({ ...existing, serverError: message });
            control.markAsTouched();
        }
    }
}
