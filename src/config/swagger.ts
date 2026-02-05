import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Project1 API Documentation',
            version: '1.0.0',
            description: 'API documentation for Field Service Management platform',
            contact: {
                name: 'Antigravity Support',
            },
        },
        servers: [
            {
                url: process.env.NODE_ENV === 'production'
                    ? 'https://your-production-url.com'
                    : `http://localhost:${process.env.PORT || 5001}`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: [
        path.join(__dirname, '../routes/*.ts'),
        path.join(__dirname, '../controllers/*.ts'),
        path.join(__dirname, '../validations/*.ts'),
    ],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
