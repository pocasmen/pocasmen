import { google } from 'googleapis';
import path from 'path';
import { logger } from './logger';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export const getGoogleAuth = () => {
    const KEY_FILE_PATH = path.join(process.cwd(), 'google-credentials.json');
    let auth: any;

    if (process.env.GOOGLE_CREDENTIALS) {
        try {
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
            auth = new google.auth.GoogleAuth({
                credentials,
                scopes: SCOPES,
            });
            logger.info('[GOOGLE AUTH] Using credentials from environment variable.');
        } catch (err) {
            logger.error(err, '[GOOGLE AUTH] Failed to parse GOOGLE_CREDENTIALS env var. Falling back to file.');
            auth = new google.auth.GoogleAuth({
                keyFile: KEY_FILE_PATH,
                scopes: SCOPES,
            });
        }
    } else {
        auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
    }

    return auth;
};

export const getCalendarClient = () => {
    const auth = getGoogleAuth();
    return google.calendar({ version: 'v3', auth });
};
