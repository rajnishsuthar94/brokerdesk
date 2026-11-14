import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export interface ProcessedImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

/** Formats people actually upload from phones and laptops. (Safari converts HEIC to JPEG on upload.) */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_DIMENSION = 1600;
/** Decoded-pixel ceiling: stops "image bombs" (tiny files that decode to huge bitmaps). */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Re-encodes every uploaded image:
 * - checks the REAL format from the bytes (a renamed .exe or SVG is rejected);
 * - applies EXIF orientation, then strips ALL metadata — phone photos carry the
 *   GPS location where they were taken, which must never be published;
 * - resizes to fit 1600×1600 and converts to WebP (fast on mobile data).
 */
@Injectable()
export class ImageProcessorService {
  async process(input: Buffer): Promise<ProcessedImage> {
    let format: string | undefined;
    try {
      ({ format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata());
    } catch {
      throw new BadRequestException('This file is not a photo we can read. Upload a JPG, PNG or WebP image.');
    }
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      throw new BadRequestException('Only JPG, PNG and WebP photos can be uploaded.');
    }
    try {
      const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate() // honour EXIF orientation before the metadata is dropped
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true }); // sharp writes no metadata unless asked to
      return { data, width: info.width, height: info.height };
    } catch {
      throw new BadRequestException('This photo could not be processed. Try another file.');
    }
  }
}
