import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

export const PRODUCT_IMAGES = Symbol('PRODUCT_IMAGES');
export const CLOUDINARY_SDK = Symbol('CLOUDINARY_SDK');
export interface ProductImageUploader {
  upload(productId: string, buffer: Buffer, mimetype: string): Promise<string>;
}
export type CloudinarySdk = Pick<typeof cloudinary, 'uploader'>;

@Injectable()
export class ProductImagesService implements ProductImageUploader {
  constructor(@Inject(CLOUDINARY_SDK) private readonly sdk: CloudinarySdk) {}

  async upload(
    productId: string,
    buffer: Buffer,
    _mimetype: string,
  ): Promise<string> {
    try {
      return await new Promise<string>((resolve, reject) => {
        const stream = this.sdk.uploader.upload_stream(
          {
            folder: 'kamadeva/products',
            public_id: `product-${productId}`,
            overwrite: true,
            invalidate: true,
            resource_type: 'image',
            allowed_formats: ['jpg', 'png', 'webp'],
          },
          (error, result) => {
            if (error || !result?.secure_url)
              return reject(new Error('Image upload failed'));
            resolve(result.secure_url);
          },
        );
        stream.on('error', reject);
        stream.end(buffer);
      });
    } catch {
      throw new BadGatewayException('No se pudo subir la imagen');
    }
  }
}
