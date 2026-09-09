import mongoose, { type Document, type Model, Schema } from 'mongoose';
import { renameMongoIdsForClient } from '../utils/renameMongoIdsForClient';

export interface IUser extends Document {
  createdAt: Date;
  displayName: string;
  email: string;
  googleId: string;
  id: string;
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

export const User: Model<IUser> = mongoose.models.users ?? mongoose.model<IUser>('users', userSchema);
