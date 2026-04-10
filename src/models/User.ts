import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { renameMongoIdsForClient } from '../utils/renameMongoIdsForClient';

export interface IUser extends Document {
  id: string;
  googleId: string;
  displayName: string;
  email: string;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  googleId: {
    type: String,
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.set('toJSON', {
  transform: (_doc, ret) => renameMongoIdsForClient(ret),
});
userSchema.set('toObject', {
  transform: (_doc, ret) => renameMongoIdsForClient(ret),
});

export const User: Model<IUser> =
  mongoose.models.users ?? mongoose.model<IUser>('users', userSchema);
