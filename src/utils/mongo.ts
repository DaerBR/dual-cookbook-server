import mongoose from 'mongoose';

export const isValidObjectId = (id: string): boolean => {
  return mongoose.isValidObjectId(id);
};
