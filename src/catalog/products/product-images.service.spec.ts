import { PassThrough } from 'node:stream';
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import {
  ProductImagesService,
  type CloudinarySdk,
} from './product-images.service.js';

describe('ProductImagesService', () => {
  const uploadStream = vi.fn();
  const sdk = { uploader: { upload_stream: uploadStream } };
  const service = new ProductImagesService(sdk as unknown as CloudinarySdk);
  type Callback = (
    error?: Error,
    result?: Pick<UploadApiResponse, 'secure_url'>,
  ) => void;
  beforeEach(() => vi.resetAllMocks());

  it('streams the buffer with stable replacement settings and returns only secure_url', async () => {
    const buffer = Buffer.from('image bytes');
    const stream = new PassThrough();
    const end = vi.spyOn(stream, 'end');
    uploadStream.mockImplementation(
      (_options: UploadApiOptions, callback: Callback) => {
        stream.on('finish', () =>
          callback(undefined, {
            secure_url: 'https://image.test/versioned.png',
          }),
        );
        return stream;
      },
    );
    expect(await service.upload('product-id', buffer, 'image/png')).toBe(
      'https://image.test/versioned.png',
    );
    expect(uploadStream).toHaveBeenCalledWith(
      {
        folder: 'kamadeva/products',
        public_id: 'product-product-id',
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'webp'],
      },
      expect.any(Function),
    );
    expect(end).toHaveBeenCalledWith(buffer);
  });
  it.each(['callback', 'empty', 'throw', 'stream'] as const)(
    'maps SDK %s failures to a stable 502 without provider details',
    async (failure) => {
      uploadStream.mockImplementation(
        (_options: UploadApiOptions, callback: Callback) => {
          if (failure === 'throw') throw new Error('secret provider detail');
          const stream = new PassThrough();
          stream.on('finish', () => {
            if (failure === 'stream')
              stream.emit('error', new Error('secret provider detail'));
            else
              callback(
                failure === 'callback'
                  ? new Error('secret provider detail')
                  : undefined,
              );
          });
          return stream;
        },
      );
      await expect(
        service.upload('id', Buffer.alloc(1), 'image/png'),
      ).rejects.toMatchObject({
        status: 502,
        message: 'No se pudo subir la imagen',
      });
    },
  );
});
