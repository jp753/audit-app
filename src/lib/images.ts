// Shrinks camera photos to about 1600px on the longest side, JPEG ~80%.
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.8;

export async function compressImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // flatten any transparency onto white
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not compress photo'))), 'image/jpeg', JPEG_QUALITY),
  );
  return { blob, width, height };
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // Respect the phone's rotation info (EXIF) so photos aren't sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall back below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
