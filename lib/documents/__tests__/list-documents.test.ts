import { isMissingOriginColumnError } from '../list-documents';

describe('isMissingOriginColumnError', () => {
    it('detects Postgres undefined-column errors', () => {
        expect(isMissingOriginColumnError({ code: '42703', message: 'column documents.origin does not exist' })).toBe(true);
    });

    it('detects Supabase message-only schema drift', () => {
        expect(isMissingOriginColumnError({ message: 'column documents.origin does not exist' })).toBe(true);
    });

    it('does not hide unrelated document list errors', () => {
        expect(isMissingOriginColumnError({ message: 'permission denied for table documents' })).toBe(false);
    });
});
