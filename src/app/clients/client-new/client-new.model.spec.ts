import { ApiError } from '@nori/core';
import { Plan } from '../../catalog/models/catalog.models';
import {
  ClientDraft,
  EMPTY_DRAFT,
  blockerBefore,
  codeFromName,
  createFailure,
  draftErrors,
  generatePassword,
  passwordStrength,
  selfServicePlans,
  toCreateClientRequest,
} from './client-new.model';

const PLAN: Plan = {
  code: 'esencial',
  name: 'Nori Esencial',
  pricingModel: 'ProgressiveTiers',
  isPublic: true,
  monthlyBasePrice: 990,
  supportLevel: 'Standard',
  analyticsLevel: 'None',
  addOnRules: [
    { addOnCode: 'billing', addOnName: 'Facturación', availability: 'Optional', listPrice: 300 },
    { addOnCode: 'inventory', addOnName: 'Inventario', availability: 'Included', listPrice: 200 },
  ],
};

const VALID: ClientDraft = {
  ...EMPTY_DRAFT,
  kind: 'pathology',
  planCode: 'esencial',
  addOnCodes: ['billing', 'inventory'],
  name: '  Laboratorio   Ejemplo ',
  code: 'laboratorio_ejemplo',
  adminName: 'Ana López',
  adminEmail: ' Ana@Lab.MX ',
  adminPassword: 'Segura-123456',
};

function apiError(status: number, detail: string): ApiError {
  return { status, code: 'X', detail };
}

describe('client-new.model', () => {
  it('derives the code from the name', () => {
    expect(codeFromName('Laboratorio Médico Ñuñoa, S.A.')).toBe('laboratorio_medico_nunoa_s_a');
  });

  it('accepts a complete draft and blocks the first invalid step', () => {
    expect(draftErrors(VALID)).toEqual({});
    expect(blockerBefore(draftErrors(VALID), 'review')).toBeUndefined();
    expect(blockerBefore(draftErrors({ ...VALID, code: 'AB' }), 'review')).toBe('lab');
    expect(blockerBefore(draftErrors({ ...VALID, kind: 'clinical' }), 'review')).toBe('type');
  });

  it('builds the request with only the add-ons the plan sells apart', () => {
    expect(toCreateClientRequest(VALID, PLAN)).toEqual({
      name: 'Laboratorio Ejemplo',
      code: 'laboratorio_ejemplo',
      mainUser: { email: 'ana@lab.mx', name: 'Ana López', password: 'Segura-123456' },
      laboratoryType: 'Pathology',
      laboratorySpecialty: null,
      planCode: 'esencial',
      addOnCodes: ['billing'],
    });
  });

  it('sends the specialty only for other labs', () => {
    const request = toCreateClientRequest({ ...VALID, kind: 'other', specialty: ' Genética ' }, PLAN);
    expect(request.laboratoryType).toBe('Other');
    expect(request.laboratorySpecialty).toBe('Genética');
  });

  it('offers only self-service plans', () => {
    const enterprise: Plan = { ...PLAN, code: 'enterprise', isPublic: false, pricingModel: 'Negotiated' };
    const catalog = { catalogCode: 'v2', catalogName: '', effectiveFrom: '', plans: [PLAN, enterprise], caseTiers: [], addOns: [] };
    expect(selfServicePlans(catalog).map((p) => p.code)).toEqual(['esencial']);
  });

  it('maps API conflicts to the field the admin can fix', () => {
    expect(createFailure(apiError(409, 'A client with code x already exists'))).toEqual(
      jasmine.objectContaining({ step: 'lab', field: 'code' }),
    );
    expect(createFailure(apiError(409, 'A user with email x already exists'))).toEqual(
      jasmine.objectContaining({ step: 'admin', field: 'adminEmail' }),
    );
    expect(createFailure(apiError(400, 'El plan Nori Enterprise se contrata con ventas.')).step).toBe('plan');
    expect(createFailure(apiError(500, 'boom')).step).toBe('review');
  });

  it('generates strong passwords', () => {
    const password = generatePassword();
    expect(password.length).toBe(14);
    expect(passwordStrength(password)).toBe(3);
  });
});
