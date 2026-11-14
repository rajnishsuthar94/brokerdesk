import { Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';

/** Rejects anything that cannot be an enquiry slug before it reaches the database. */
@Injectable()
export class ParseSlugPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) {
      throw new NotFoundException('This enquiry form is not available. Please contact the agency directly.');
    }
    return value;
  }
}
