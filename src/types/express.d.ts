declare global {
  namespace Express {
    /**
     * Authenticated user (Mongoose `users` document fields used by the API).
     */
    interface User {
      id: string;
      googleId: string;
      displayName: string;
      email: string;
      createdAt: Date;
    }
  }
}

export {};
