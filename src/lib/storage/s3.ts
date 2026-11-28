/** Storage S3/MinIO (integração Storage S3 da central `@nandobfer/integracoes`), com o runtime do Opex já configurado. */
import "@/lib/integrations/runtime"

export {
    checkBucket,
    copyFile,
    deleteFile,
    getFileObject,
    getFileStream,
    getFileUrl,
    getSignedUrlExpiresIn,
    getUploadUrl,
    headFile,
    storageErrorInfo,
    uploadFile,
    type SignedUrlAudience,
    type StorageErrorInfo,
    type StorageErrorKind,
    type StoredFile,
} from "@nandobfer/integracoes/storage-s3/server"
