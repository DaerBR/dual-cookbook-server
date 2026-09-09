import mongoose from 'mongoose';

export const isValidObjectId = (id: string): boolean => mongoose.isValidObjectId(id);
