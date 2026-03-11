import { sendEmail, resetTransporter } from '../emailService';

// ── Mock global fetch (Node 18+) ─────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ── Mock supabase (used only by sendEmailWithTemplate) ───────────────────────
jest.mock('../../config/supabase', () => ({
    supabase: {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeBrevoResponse = (ok: boolean, body: object, status = 200) =>
    Promise.resolve({
        ok,
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);

describe('EmailService — Brevo HTTP API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetTransporter();
        process.env.BREVO_API_KEY = 'test-brevo-key-123';
        process.env.EMAIL_FROM    = 'noreply@example.com';
        process.env.APP_NAME      = 'TestApp';
    });

    afterEach(() => {
        delete process.env.BREVO_API_KEY;
        delete process.env.EMAIL_FROM;
        delete process.env.APP_NAME;
    });

    // ── sendEmail ─────────────────────────────────────────────────────────────
    describe('sendEmail', () => {
        it('sends email via Brevo HTTP POST and returns messageId', async () => {
            mockFetch.mockReturnValueOnce(
                makeBrevoResponse(true, { messageId: 'brevo-msg-001' })
            );

            const result = await sendEmail(
                'recipient@example.com',
                'Hello World',
                '<p>Test body</p>'
            );

            // Verify the correct endpoint was called
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.brevo.com/v3/smtp/email',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'api-key': 'test-brevo-key-123',
                        'content-type': 'application/json',
                    }),
                })
            );

            // Verify payload structure
            const callBody = JSON.parse(
                (mockFetch.mock.calls[0][1] as RequestInit).body as string
            );
            expect(callBody).toMatchObject({
                sender: { name: 'TestApp', email: 'noreply@example.com' },
                to:     [{ email: 'recipient@example.com' }],
                subject: 'Hello World',
                htmlContent: '<p>Test body</p>',
            });

            expect(result).toEqual({ messageId: 'brevo-msg-001' });
        });

        it('returns null and logs warning when BREVO_API_KEY is missing', async () => {
            delete process.env.BREVO_API_KEY;

            const result = await sendEmail('test@example.com', 'Sub', '<p>body</p>');

            expect(mockFetch).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

        it('throws BadRequestError for an invalid email address', async () => {
            await expect(
                sendEmail('not-an-email', 'Sub', '<p>body</p>')
            ).rejects.toThrow('Endereço de email inválido');

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('sanitises CRLF injection in subject', async () => {
            mockFetch.mockReturnValueOnce(
                makeBrevoResponse(true, { messageId: 'brevo-crlf-001' })
            );

            await sendEmail('test@example.com', 'Bad\r\nSubject', '<p>body</p>');

            const callBody = JSON.parse(
                (mockFetch.mock.calls[0][1] as RequestInit).body as string
            );
            expect(callBody.subject).toBe('BadSubject');
        });

        it('throws when Brevo API returns a non-OK response', async () => {
            mockFetch.mockReturnValueOnce(
                makeBrevoResponse(false, { code: 'invalid_parameter', message: 'valid sender email required' }, 400)
            );

            await expect(
                sendEmail('test@example.com', 'Sub', '<p>body</p>')
            ).rejects.toThrow('Brevo API error 400');
        });

        it('uses fallback sender when EMAIL_FROM is absent', async () => {
            delete process.env.EMAIL_FROM;
            mockFetch.mockReturnValueOnce(
                makeBrevoResponse(true, { messageId: 'brevo-fallback-001' })
            );

            await sendEmail('test@example.com', 'Sub', '<p>body</p>');

            const callBody = JSON.parse(
                (mockFetch.mock.calls[0][1] as RequestInit).body as string
            );
            // Should fall back to the hardcoded default
            expect(callBody.sender.email).toBe('noreply@microatomo.pt');
        });
    });

    // ── resetTransporter ──────────────────────────────────────────────────────
    describe('resetTransporter', () => {
        it('is a no-op that does not throw (HTTP API is stateless)', () => {
            expect(() => resetTransporter()).not.toThrow();
        });
    });
});
