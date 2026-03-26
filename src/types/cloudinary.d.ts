/**
 * Minimal typings for `cloudinary` so `tsc` succeeds when package types are not resolved
 * (e.g. `moduleResolution: "NodeNext"` in some environments, or CI without `node_modules`).
 * If `node_modules/cloudinary/types` is present, this merges with the official declarations.
 */
declare module 'cloudinary' {
  export namespace v2 {
    function config(
      options?:
        | boolean
        | {
            cloud_name?: string;
            api_key?: string;
            api_secret?: string;
            secure?: boolean;
          },
    ): unknown;

    namespace uploader {
      function upload(
        file: string,
        options?: Record<string, unknown>,
      ): Promise<{ public_id: string; secure_url: string }>;

      function destroy(
        publicId: string,
        options?: Record<string, unknown>,
      ): Promise<unknown>;
    }
  }
}
