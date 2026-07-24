import { AwsClient } from "aws4fetch";
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Normalize a logical object-store key the same way Aws4FetchClient assigns URL pathnames.
 * Decodes percent-escapes and resolves `.` / `..` segments before the request is signed.
 */
export function normalizeObjectStoreLogicalKeyPathname(logicalKey: string): string {
  const url = new URL("https://trigger.invalid");
  url.pathname = `/${logicalKey.replace(/^\/+/, "")}`;
  return url.pathname;
}

interface IObjectStoreClient {
  putObject(key: string, body: ReadableStream | string, contentType: string): Promise<string>;
  getObject(key: string): Promise<string>;
  presign(key: string, method: "PUT" | "GET", expiresIn: number): Promise<string>;
  verify(): Promise<void>;
}

type Aws4FetchConfig = {
  baseUrl: string;
  bucket?: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
};

class Aws4FetchClient implements IObjectStoreClient {
  private readonly awsClient: AwsClient;

  constructor(private readonly config: Aws4FetchConfig) {
    this.awsClient = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      // We set the default value to "s3" in the schema to enhance interoperability with various
      // S3-compatible services. Setting this env var to an empty string restores the old behaviour.
      service: config.service || undefined,
    });
  }

  private buildUrl(key?: string): string {
    const url = new URL(this.config.baseUrl);
    const bucket = this.config.bucket;
    const bucketIsAlreadyInHost = bucket
      ? url.hostname.toLowerCase().startsWith(`${bucket.toLowerCase()}.`)
      : false;
    const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    const bucketPath = bucket ? normalizeObjectStoreLogicalKeyPathname(bucket) : "";
    const basePathSegments = basePath.split("/").filter(Boolean);
    const baseAlreadySelectsBucket = Boolean(
      bucketPath &&
        (basePath === bucketPath || basePathSegments.at(-1) === bucket)
    );
    const parts = [basePath];
    if (bucketPath && !bucketIsAlreadyInHost && !baseAlreadySelectsBucket) parts.push(bucketPath);
    if (key) {
      const objectKey = bucket && key.startsWith(`${bucket}/`) ? key.slice(bucket.length + 1) : key;
      parts.push(normalizeObjectStoreLogicalKeyPathname(objectKey));
    }
    url.pathname = parts.filter(Boolean).join("/").replace(/\/{2,}/g, "/") || "/";
    return url.toString();
  }

  private buildBucketUrl(): string {
    return this.buildUrl();
  }

  async putObject(
    key: string,
    body: ReadableStream | string,
    contentType: string
  ): Promise<string> {
    const objectUrl = this.buildUrl(key);
    const response = await this.awsClient.fetch(objectUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    if (!response.ok) {
      throw new Error(`Failed to upload to object store: ${response.statusText}`);
    }
    return objectUrl;
  }

  async getObject(key: string): Promise<string> {
    const response = await this.awsClient.fetch(this.buildUrl(key));
    if (!response.ok) {
      throw new Error(`Failed to download from object store: ${response.statusText}`);
    }
    return response.text();
  }

  async presign(key: string, method: "PUT" | "GET", expiresIn: number): Promise<string> {
    const url = new URL(this.buildUrl(key));
    url.searchParams.set("X-Amz-Expires", String(expiresIn));

    const signed = await this.awsClient.sign(new Request(url, { method }), {
      aws: { signQuery: true },
    });
    return signed.url;
  }

  async verify(): Promise<void> {
    const response = await this.awsClient.fetch(this.buildBucketUrl(), { method: "HEAD" });
    if (!response.ok) {
      throw new Error("Object-store bucket verification failed");
    }
  }
}

type AwsSdkConfig = {
  bucket: string;
  baseUrl: string;
  region?: string;
};

class AwsSdkClient implements IObjectStoreClient {
  private readonly s3Client: S3Client;

  constructor(private readonly config: AwsSdkConfig) {
    this.s3Client = new S3Client({
      endpoint: config.baseUrl,
      forcePathStyle: true,
      ...(config.region ? { region: config.region } : {}),
    });
  }

  /**
   * Callers use a single logical key (same as aws4fetch path: `bucket/object/...`).
   * S3 APIs take Bucket + Key where Key must not repeat the bucket name.
   */
  private toS3ObjectKey(logicalKey: string): string {
    const prefix = `${this.config.bucket}/`;
    if (logicalKey.startsWith(prefix)) {
      return logicalKey.slice(prefix.length);
    }
    return logicalKey;
  }

  private logicalObjectUrl(logicalKey: string): string {
    const url = new URL(this.config.baseUrl);
    url.pathname = normalizeObjectStoreLogicalKeyPathname(logicalKey);
    return url.href;
  }

  async putObject(
    key: string,
    body: ReadableStream | string,
    contentType: string
  ): Promise<string> {
    const s3Key = this.toS3ObjectKey(key);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
        Body: body,
        ContentType: contentType,
      })
    );
    return this.logicalObjectUrl(key);
  }

  async getObject(key: string): Promise<string> {
    const s3Key = this.toS3ObjectKey(key);
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: s3Key })
    );
    if (!response.Body) {
      throw new Error(`Empty response body from object store for key: ${key}`);
    }
    return response.Body.transformToString();
  }

  async presign(key: string, method: "PUT" | "GET", expiresIn: number): Promise<string> {
    const s3Key = this.toS3ObjectKey(key);
    const command =
      method === "PUT"
        ? new PutObjectCommand({ Bucket: this.config.bucket, Key: s3Key })
        : new GetObjectCommand({ Bucket: this.config.bucket, Key: s3Key });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async verify(): Promise<void> {
    await this.s3Client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
  }
}

export type ObjectStoreClientConfig = {
  baseUrl: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  service?: string;
};

export class ObjectStoreClient implements IObjectStoreClient {
  private constructor(
    private readonly impl: IObjectStoreClient,
    /** When set, logical keys may start with `${bucket}/…`; AwsSdkClient strips that prefix for S3 APIs. */
    readonly bucket: string | undefined
  ) {}

  static create(config: ObjectStoreClientConfig): ObjectStoreClient {
    if (config.accessKeyId && config.secretAccessKey) {
      return new ObjectStoreClient(
        new Aws4FetchClient({
          baseUrl: config.baseUrl,
          bucket: config.bucket,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          region: config.region,
          service: config.service,
        }),
        config.bucket
      );
    }

    // IAM credential chain — AWS SDK S3Client handles credential refresh automatically
    if (!config.bucket) {
      throw new Error(
        "OBJECT_STORE_BUCKET is required when not using access key credentials (IAM mode)"
      );
    }

    return new ObjectStoreClient(
      new AwsSdkClient({
        bucket: config.bucket,
        baseUrl: config.baseUrl,
        region: config.region,
      }),
      config.bucket
    );
  }

  putObject(key: string, body: ReadableStream | string, contentType: string): Promise<string> {
    return this.impl.putObject(key, body, contentType);
  }

  getObject(key: string): Promise<string> {
    return this.impl.getObject(key);
  }

  presign(key: string, method: "PUT" | "GET", expiresIn: number): Promise<string> {
    return this.impl.presign(key, method, expiresIn);
  }

  verify(): Promise<void> {
    return this.impl.verify();
  }
}
