import mongoose, { Schema, type Document, type Model } from 'mongoose';

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

export const User: Model<IUser> =
  mongoose.models.users ?? mongoose.model<IUser>('users', userSchema);
