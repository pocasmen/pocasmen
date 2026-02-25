//Horas de desenvolvimento activo=1,5
export class ApiError extends Error {
    public statusCode: number;
    public details?: any;

    constructor(statusCode: number, message: string, details?: any) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        Object.setPrototypeOf(this, ApiError.prototype);
    }
}

export class BadRequestError extends ApiError {
    constructor(message: string = 'Bad Request', details?: any) {
        super(400, message, details);
    }
}

export class UnauthorizedError extends ApiError {
    constructor(message: string = 'Unauthorized') {
        super(401, message);
    }
}

export class ForbiddenError extends ApiError {
    constructor(message: string = 'Forbidden') {
        super(403, message);
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string = 'Not Found') {
        super(404, message);
    }
}

export class InternalServerError extends ApiError {
    constructor(message: string = 'Internal Server Error', details?: any) {
        super(500, message, details);
    }
}
