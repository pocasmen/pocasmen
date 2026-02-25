import { getServiceTypeKey, getServiceTypeKeys, formatServiceType } from '../scheduleService';

describe('Schedule Service Utilities', () => {
    describe('getServiceTypeKey', () => {
        test('should handle simple strings', () => {
            expect(getServiceTypeKey('manutencao')).toBe('manutencao');
        });

        test('should handle arrays', () => {
            expect(getServiceTypeKey(['reparacao', 'manutencao'])).toBe('reparacao');
        });

        test('should handle Postgres array literals', () => {
            expect(getServiceTypeKey('{"instalacao", "calibracao"}')).toBe('instalacao');
        });

        test('should handle JSON array strings', () => {
            expect(getServiceTypeKey('["assistencia"]')).toBe('assistencia');
        });

        test('should handle undefined or null', () => {
            expect(getServiceTypeKey(null)).toBe('');
            expect(getServiceTypeKey(undefined)).toBe('');
        });
    });

    describe('getServiceTypeKeys', () => {
        test('should return all keys from Postgres array literal', () => {
            expect(getServiceTypeKeys('{"manutencao", "reparacao"}')).toEqual(['manutencao', 'reparacao']);
        });

        test('should return all keys from array', () => {
            expect(getServiceTypeKeys(['a', 'b'])).toEqual(['a', 'b']);
        });
    });

    describe('formatServiceType', () => {
        test('should return mapped label', () => {
            expect(formatServiceType('manutencao')).toBe('Manutenção');
        });

        test('should capitalize unmapped labels', () => {
            expect(formatServiceType('custom')).toBe('Custom');
        });

        test('should handle first element of list', () => {
            expect(formatServiceType(['reparacao', 'manutencao'])).toBe('Reparação');
        });
    });
});
