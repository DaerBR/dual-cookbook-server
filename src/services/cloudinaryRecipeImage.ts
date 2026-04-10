import { v2 as cloudinary } from 'cloudinary';
import { getEnv } from '../config/env';

let isCloudinaryConfigured = false;

const configureCloudinary = (): void => {
  if (isCloudinaryConfigured) {
    return;
  }
  const e = getEnv();
  cloudinary.config({
    cloud_name: e.CLOUDINARY_CLOUD_NAME,
    api_key: e.CLOUDINARY_API_KEY,
    api_secret: e.CLOUDINARY_API_SECRET,
    secure: true,
  });
  isCloudinaryConfigured = true;
};

export const uploadRecipeImage = async (
  recipeId: string,
  dataUri: string,
): Promise<{ publicId: string; secureUrl: string }> => {
  configureCloudinary();
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `dual-cookbook/recipes/${recipeId}`,
    resource_type: 'image',
    overwrite: false,
    unique_filename: true,
  });
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
  };
};

export const uploadCategoryImage = async (
  categoryId: string,
  dataUri: string,
): Promise<{ publicId: string; secureUrl: string }> => {
  configureCloudinary();
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `dual-cookbook/categories/${categoryId}`,
    resource_type: 'image',
    overwrite: false,
    unique_filename: true,
  });
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
  };
};

export const destroyImageByPublicId = async (publicId: string): Promise<void> => {
  configureCloudinary();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('Cloudinary destroy failed', publicId, err);
  }
};
