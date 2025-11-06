import { apiClientWithHeaders } from '@/shared/lib/axios';
import { createZodObject } from './zod-checker';
import type { BaseRequestSchema, BaseResponseSchema, ErrorResponseSchema } from './dto';

export { 
    apiClientWithHeaders, 
    createZodObject, 
    BaseRequestSchema, 
    BaseResponseSchema, 
    ErrorResponseSchema 
}
