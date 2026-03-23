import mongoose from 'mongoose';

export function isValidObjectId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}
