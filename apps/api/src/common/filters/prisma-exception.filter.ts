import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Maps known Prisma errors to safe HTTP responses. Never leaks SQL, table names
 * or constraint details to the client; the details are logged server-side.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    switch (exception.code) {
      case 'P2002': // unique constraint
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'A record with these details already exists',
        });
        return;
      case 'P2025': // record not found for update/delete
        res.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'Not found',
        });
        return;
      case 'P2003': // foreign key violation (includes cross-tenant composite FKs)
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'A referenced record does not exist',
        });
        return;
      default:
        this.logger.error(`Unhandled Prisma error ${exception.code}`, exception.stack);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: 'Something went wrong',
        });
    }
  }
}
