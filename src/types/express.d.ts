declare global {
  namespace Express {
    /**
     * Authenticated user (Mongoose `users` document fields used by the API).
     */
    interface User {
      createdAt: Date;
      displayName: string;
      email: string;
      googleId: string;
      id: string;
    }
  }
}

export {};
