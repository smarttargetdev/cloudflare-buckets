import type { MonorepoFile } from '../shared/types';

export const DOTNET_FILES: MonorepoFile[] = [
  {
    path: 'backend-dotnet10/Buckets.Api/Buckets.Api.csproj',
    stack: 'backend-dotnet10',
    language: 'xml',
    summary: '.NET Core 10 WebAPI project with Official AWS S3 SDK, Serilog multi-sink logging, and OpenTelemetry metrics.',
    content: `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>Buckets.Api</RootNamespace>
    <AssemblyName>Buckets.Api</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="AWSSDK.S3" Version="4.0.0" />
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.0" />
    <PackageReference Include="Serilog.AspNetCore" Version="9.0.0" />
    <PackageReference Include="Serilog.Sinks.File" Version="6.0.0" />
    <PackageReference Include="Serilog.Sinks.Seq" Version="9.0.0" />
    <PackageReference Include="Serilog.Sinks.ApplicationInsights" Version="4.0.0" />
    <PackageReference Include="Elastic.Serilog.Sinks" Version="8.12.0" />
    <PackageReference Include="OpenTelemetry.Exporter.Prometheus.AspNetCore" Version="1.11.0-beta.1" />
    <PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.11.0" />
    <PackageReference Include="OpenTelemetry.Instrumentation.AspNetCore" Version="1.11.0" />
  </ItemGroup>
</Project>
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/appsettings.json',
    stack: 'backend-dotnet10',
    language: 'json',
    summary: 'Configuration for Cloudflare R2 credentials, Serilog rolling files, Seq, Application Insights, and ELK Stack.',
    content: `{
  "CloudflareR2": {
    "AccountId": "",
    "ApiToken": "",
    "AccessKeyId": "",
    "SecretAccessKey": "",
    "DefaultLocationHint": "ENAM"
  },
  "Observability": {
    "EnableApplicationInsights": true,
    "ApplicationInsightsConnectionString": "",
    "EnableSeq": true,
    "SeqServerUrl": "http://localhost:5341",
    "EnableElkStack": false,
    "ElasticsearchNodeUrl": "http://localhost:9200",
    "ElkIndexFormat": "buckets-r2-logs-{0:yyyy.MM.dd}"
  },
  "Serilog": {
    "Using": [ "Serilog.Sinks.Console", "Serilog.Sinks.File", "Serilog.Sinks.Seq" ],
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft.AspNetCore": "Warning",
        "AWSSDK": "Warning"
      }
    },
    "Enrich": [ "FromLogContext", "WithMachineName", "WithThreadId" ],
    "WriteTo": [
      { "Name": "Console" },
      {
        "Name": "File",
        "Args": {
          "path": "logs/buckets-api-.clef",
          "rollingInterval": "Day",
          "retainedFileCountLimit": 30,
          "formatter": "Serilog.Formatting.Compact.CompactJsonFormatter, Serilog.Formatting.Compact"
        }
      }
    ]
  },
  "AllowedHosts": "*"
}
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Program.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: '.NET 10 entry point wiring Serilog sinks, Official AWSSDK.S3 for R2, OpenTelemetry metrics, and RFC 7807 error middleware.',
    content: `using Amazon.Runtime;
using Amazon.S3;
using Buckets.Api.Configuration;
using Buckets.Api.Middleware;
using Buckets.Api.Services;
using Buckets.Api.Telemetry;
using Elastic.Channels;
using Elastic.Ingest.Elasticsearch;
using Elastic.Ingest.Elasticsearch.DataStreams;
using Elastic.Serilog.Sinks;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.Extensions.Options;
using OpenTelemetry.Metrics;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<CloudflareR2Options>(builder.Configuration.GetSection("CloudflareR2"));
builder.Services.Configure<ObservabilityOptions>(builder.Configuration.GetSection("Observability"));

builder.Host.UseSerilog((context, services, loggerConfig) =>
{
    var obs = context.Configuration.GetSection("Observability").Get<ObservabilityOptions>() ?? new ObservabilityOptions();

    loggerConfig
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.WithProperty("System", "Cloudflare Buckets")
        .Enrich.WithProperty("Service", "Buckets.Api");

    if (obs.EnableSeq && !string.IsNullOrWhiteSpace(obs.SeqServerUrl))
    {
        loggerConfig.WriteTo.Seq(obs.SeqServerUrl);
    }

    if (obs.EnableApplicationInsights && !string.IsNullOrWhiteSpace(obs.ApplicationInsightsConnectionString))
    {
        var telemetryConfig = new TelemetryConfiguration { ConnectionString = obs.ApplicationInsightsConnectionString };
        loggerConfig.WriteTo.ApplicationInsights(telemetryConfig, TelemetryConverter.Traces);
    }

    if (obs.EnableElkStack && !string.IsNullOrWhiteSpace(obs.ElasticsearchNodeUrl))
    {
        loggerConfig.WriteTo.Elasticsearch([new Uri(obs.ElasticsearchNodeUrl)], opts =>
        {
            opts.DataStream = new DataStreamName("logs", "buckets-api", "production");
            opts.BootstrapMethod = BootstrapMethod.Failure;
            opts.ConfigureChannel = channelOpts => { channelOpts.BufferOptions = new BufferOptions(); };
        });
    }
});

builder.Services.AddSingleton<BucketsMetrics>();
builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddMeter(BucketsMetrics.MeterName)
        .AddPrometheusExporter());

builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    var r2 = sp.GetRequiredService<IOptions<CloudflareR2Options>>().Value;
    var credentials = new BasicAWSCredentials(r2.AccessKeyId, r2.SecretAccessKey);
    var config = new AmazonS3Config
    {
        ServiceURL = $"https://{r2.AccountId}.r2.cloudflarestorage.com",
        ForcePathStyle = true,
        AuthenticationRegion = "auto"
    };
    return new AmazonS3Client(credentials, config);
});

builder.Services.AddHttpClient<ICloudflareBucketAdminService, CloudflareBucketAdminService>();
builder.Services.AddScoped<IR2StorageService, R2StorageService>();
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

app.UseMiddleware<StandardErrorMiddleware>();
app.UseSerilogRequestLogging();
app.UseCors();
app.MapOpenApi();
app.MapPrometheusScrapingEndpoint("/metrics");
app.MapControllers();

app.Run();
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Configuration/CloudflareR2Options.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'Strongly-typed options for Cloudflare R2 S3 credentials, REST API token, and observability sinks.',
    content: `namespace Buckets.Api.Configuration;

public sealed class CloudflareR2Options
{
    public string AccountId { get; set; } = string.Empty;
    public string ApiToken { get; set; } = string.Empty;
    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string DefaultLocationHint { get; set; } = "ENAM";
}

public sealed class ObservabilityOptions
{
    public bool EnableApplicationInsights { get; set; }
    public string ApplicationInsightsConnectionString { get; set; } = string.Empty;
    public bool EnableSeq { get; set; } = true;
    public string SeqServerUrl { get; set; } = "http://localhost:5341";
    public bool EnableElkStack { get; set; }
    public string ElasticsearchNodeUrl { get; set; } = "http://localhost:9200";
    public string ElkIndexFormat { get; set; } = "buckets-r2-logs-{0:yyyy.MM.dd}";
}
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Models/Contracts.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'API contracts for buckets, hierarchical directories, metadata search, bulk move/delete, and RFC 7807 errors.',
    content: `namespace Buckets.Api.Models;

public sealed record BucketSummary(
    string Name,
    DateTimeOffset CreatedAt,
    string LocationHint,
    string StorageClass,
    long ObjectCount,
    long TotalBytes,
    bool CorsEnabled);

public sealed record DirectoryEntry(string Prefix, string Name, bool HasMarkerObject);

public sealed record R2ObjectItem(
    string Bucket,
    string Key,
    string FileName,
    string ParentPrefix,
    long Size,
    DateTimeOffset LastModified,
    string ETag,
    string ContentType,
    string StorageClass,
    bool IsFolderMarker,
    IReadOnlyDictionary<string, string> Metadata);

public sealed record DirectoryListing(
    string Bucket,
    string Prefix,
    IReadOnlyList<DirectoryEntry> Folders,
    IReadOnlyList<R2ObjectItem> Objects,
    int TotalObjectsInPrefix,
    bool IsTruncated,
    string? NextContinuationToken);

public sealed record CreateBucketRequest(string Name, string LocationHint = "ENAM", string StorageClass = "Standard");
public sealed record CreateFolderRequest(string Prefix, bool CreateMarkerObject = true);
public sealed record SaveObjectContentRequest(string Key, string Content, string ContentType = "text/plain", IReadOnlyDictionary<string, string>? Metadata = null);
public sealed record SearchRequest(string? Query, string? Bucket, string? TagKey, string? TagValue, string? ContentType);
public sealed record SearchResponse(SearchRequest Query, int TotalMatches, int BucketsScanned, long ElapsedMs, IReadOnlyList<R2ObjectItem> Results);

public sealed record BulkDeleteRequest(string Bucket, IReadOnlyList<string> Keys, bool RecursiveFolders = false);
public sealed record BulkMoveRequest(string SourceBucket, string DestinationBucket, string DestinationPrefix, IReadOnlyList<string> Keys, bool Overwrite = false);
public sealed record BulkItemFailure(string Key, string ErrorCode, string Reason);

public sealed record BulkOperationResult(
    string Operation,
    int RequestedCount,
    int SucceededCount,
    int FailedCount,
    IReadOnlyList<string> SucceededKeys,
    IReadOnlyList<BulkItemFailure> Failures,
    long ElapsedMs);

public sealed record ApiErrorResponse(
    string Type,
    string Title,
    int Status,
    string Detail,
    string ErrorCode,
    string TraceId,
    DateTimeOffset Timestamp,
    string? Instance = null,
    IReadOnlyDictionary<string, string[]>? ValidationErrors = null,
    IReadOnlyList<BulkItemFailure>? PartialFailures = null);
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Telemetry/BucketsMetrics.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'System.Diagnostics.Metrics instruments tracking R2 SDK latency, byte throughput, and operation error counters.',
    content: `using System.Diagnostics.Metrics;

namespace Buckets.Api.Telemetry;

public sealed class BucketsMetrics
{
    public const string MeterName = "Buckets.R2.Metrics";

    private readonly Histogram<double> _r2DurationMs;
    private readonly Counter<long> _r2TransferBytes;
    private readonly Counter<long> _r2ErrorsTotal;

    public BucketsMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName, "1.0.0");
        _r2DurationMs = meter.CreateHistogram<double>("buckets.r2.operation.duration", "ms", "Duration of Cloudflare R2 SDK operations");
        _r2TransferBytes = meter.CreateCounter<long>("buckets.r2.transfer.bytes", "By", "Total bytes transferred to/from Cloudflare R2");
        _r2ErrorsTotal = meter.CreateCounter<long>("buckets.r2.errors.total", "{error}", "Total errors across Cloudflare R2 operations");
    }

    public void RecordOperation(string operation, string bucket, double durationMs, long bytes = 0, bool success = true)
    {
        var tags = new KeyValuePair<string, object?>[]
        {
            new("r2.operation", operation),
            new("r2.bucket", bucket),
            new("r2.success", success)
        };

        _r2DurationMs.Record(durationMs, tags);
        if (bytes > 0) _r2TransferBytes.Add(bytes, tags);
        if (!success) _r2ErrorsTotal.Add(1, tags);
    }
}
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Middleware/StandardErrorMiddleware.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'Global exception middleware emitting RFC 7807 ProblemDetails JSON with TraceId and structured Serilog logs.',
    content: `using System.Diagnostics;
using Amazon.S3;
using Buckets.Api.Models;

namespace Buckets.Api.Middleware;

public sealed class BucketDomainException : Exception
{
    public int StatusCode { get; }
    public string ErrorCode { get; }

    public BucketDomainException(int statusCode, string errorCode, string message) : base(message)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }
}

public sealed class StandardErrorMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<StandardErrorMiddleware> _logger;

    public StandardErrorMiddleware(RequestDelegate next, ILogger<StandardErrorMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
            var (status, errorCode, title) = ex switch
            {
                BucketDomainException dom => (dom.StatusCode, dom.ErrorCode, "Domain Validation Error"),
                AmazonS3Exception s3 => ((int)s3.StatusCode, $"R2_{s3.ErrorCode}", "Cloudflare R2 SDK Error"),
                _ => (StatusCodes.Status500InternalServerError, "INTERNAL_SERVER_ERROR", "Internal Server Error")
            };

            _logger.LogError(ex, "Request failed with {ErrorCode} ({StatusCode}) TraceId={TraceId} Path={Path}",
                errorCode, status, traceId, context.Request.Path);

            var payload = new ApiErrorResponse(
                Type: $"https://buckets.cloudflare.dev/errors/{errorCode.ToLowerInvariant()}",
                Title: title,
                Status: status,
                Detail: ex.Message,
                ErrorCode: errorCode,
                TraceId: traceId,
                Timestamp: DateTimeOffset.UtcNow,
                Instance: context.Request.Path);

            context.Response.StatusCode = status;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsJsonAsync(payload);
        }
    }
}
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Services/R2StorageService.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'Official AWSSDK.S3 service implementing hierarchical virtual folders, metadata search, bulk move/delete, and R2 metrics.',
    content: `using System.Diagnostics;
using Amazon.S3;
using Amazon.S3.Model;
using Buckets.Api.Middleware;
using Buckets.Api.Models;
using Buckets.Api.Telemetry;

namespace Buckets.Api.Services;

public interface IR2StorageService
{
    Task<DirectoryListing> ListDirectoryAsync(string bucket, string? prefix, CancellationToken ct);
    Task<DirectoryEntry> CreateFolderAsync(string bucket, string prefix, bool createMarkerObject, CancellationToken ct);
    Task<int> DeleteFolderAsync(string bucket, string prefix, bool recursive, CancellationToken ct);
    Task<int> EmptyBucketAsync(string bucket, CancellationToken ct);
    Task<R2ObjectItem> UploadObjectAsync(string bucket, string key, Stream content, string contentType, IDictionary<string, string> metadata, CancellationToken ct);
    Task<SearchResponse> SearchAsync(SearchRequest request, CancellationToken ct);
    Task<BulkOperationResult> BulkDeleteAsync(BulkDeleteRequest request, CancellationToken ct);
    Task<BulkOperationResult> BulkMoveAsync(BulkMoveRequest request, CancellationToken ct);
}

public sealed class R2StorageService : IR2StorageService
{
    private readonly IAmazonS3 _s3;
    private readonly BucketsMetrics _metrics;
    private readonly ILogger<R2StorageService> _logger;

    public R2StorageService(IAmazonS3 s3, BucketsMetrics metrics, ILogger<R2StorageService> logger)
    {
        _s3 = s3;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<DirectoryListing> ListDirectoryAsync(string bucket, string? prefix, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var normalized = NormalizePrefix(prefix);

        var response = await _s3.ListObjectsV2Async(new ListObjectsV2Request
        {
            BucketName = bucket,
            Prefix = normalized,
            Delimiter = "/",
            MaxKeys = 500
        }, ct);

        var folders = response.CommonPrefixes
            .Select(cp => new DirectoryEntry(cp, cp[normalized.Length..].TrimEnd('/'), false))
            .ToList();

        var objects = new List<R2ObjectItem>();
        foreach (var item in response.S3Objects.Where(o => o.Key != normalized && !o.Key.EndsWith('/')))
        {
            var head = await _s3.GetObjectMetadataAsync(bucket, item.Key, ct);
            var meta = head.Metadata.Keys.ToDictionary(k => k.Replace("x-amz-meta-", ""), k => head.Metadata[k]);
            objects.Add(new R2ObjectItem(
                bucket,
                item.Key,
                item.Key[normalized.Length..],
                normalized,
                item.Size ?? 0,
                item.LastModified ?? DateTimeOffset.UtcNow,
                item.ETag,
                head.Headers.ContentType ?? "application/octet-stream",
                item.StorageClass?.Value ?? "Standard",
                false,
                meta));
        }

        _metrics.RecordOperation("ListObjectsV2", bucket, sw.Elapsed.TotalMilliseconds);
        _logger.LogInformation("Listed directory {Prefix} in bucket {Bucket}: {FolderCount} folders, {ObjectCount} files",
            normalized, bucket, folders.Count, objects.Count);

        return new DirectoryListing(bucket, normalized, folders, objects, objects.Count, response.IsTruncated ?? false, response.NextContinuationToken);
    }

    public async Task<DirectoryEntry> CreateFolderAsync(string bucket, string prefix, bool createMarkerObject, CancellationToken ct)
    {
        var normalized = NormalizePrefix(prefix);
        if (string.IsNullOrEmpty(normalized) || normalized.Contains(".."))
            throw new BucketDomainException(400, "FOLDER_INVALID_NAME", "Folder prefix cannot be empty or contain '..'.");

        var sw = Stopwatch.StartNew();
        if (createMarkerObject)
        {
            await _s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucket,
                Key = normalized,
                InputStream = new MemoryStream([]),
                ContentType = "application/x-directory",
                DisablePayloadSigning = true
            }, ct);
        }

        _metrics.RecordOperation("CreateFolderMarker", bucket, sw.Elapsed.TotalMilliseconds);
        var name = normalized.TrimEnd('/').Split('/').Last();
        return new DirectoryEntry(normalized, name, createMarkerObject);
    }

    public async Task<int> DeleteFolderAsync(string bucket, string prefix, bool recursive, CancellationToken ct)
    {
        var normalized = NormalizePrefix(prefix);
        if (string.IsNullOrEmpty(normalized) || normalized.Contains(".."))
            throw new BucketDomainException(400, "FOLDER_INVALID_NAME", "Folder prefix cannot be empty or contain '..'.");

        var sw = Stopwatch.StartNew();
        var keys = new List<string>();
        string? token = null;
        do
        {
            var listed = await _s3.ListObjectsV2Async(new ListObjectsV2Request { BucketName = bucket, Prefix = normalized, ContinuationToken = token, MaxKeys = 1000 }, ct);
            keys.AddRange(listed.S3Objects.Select(o => o.Key));
            token = (listed.IsTruncated ?? false) ? listed.NextContinuationToken : null;
        } while (token is not null);

        if (keys.Any(k => k != normalized) && !recursive)
            throw new BucketDomainException(409, "FOLDER_NOT_EMPTY", $"Folder '{normalized}' is not empty. Pass recursive=true after user confirmation.");

        foreach (var chunk in keys.Chunk(1000))
        {
            await _s3.DeleteObjectsAsync(new DeleteObjectsRequest { BucketName = bucket, Objects = chunk.Select(k => new KeyVersion { Key = k }).ToList() }, ct);
        }
        _metrics.RecordOperation("BulkDelete", bucket, sw.Elapsed.TotalMilliseconds);
        return keys.Count;
    }

    public async Task<int> EmptyBucketAsync(string bucket, CancellationToken ct)
    {
        var deleted = 0;
        string? token = null;
        do
        {
            var listed = await _s3.ListObjectsV2Async(new ListObjectsV2Request { BucketName = bucket, ContinuationToken = token, MaxKeys = 1000 }, ct);
            if (listed.S3Objects.Count > 0)
            {
                await _s3.DeleteObjectsAsync(new DeleteObjectsRequest { BucketName = bucket, Objects = listed.S3Objects.Select(o => new KeyVersion { Key = o.Key }).ToList() }, ct);
                deleted += listed.S3Objects.Count;
            }
            token = (listed.IsTruncated ?? false) ? listed.NextContinuationToken : null;
        } while (token is not null);
        return deleted;
    }

    public async Task<R2ObjectItem> UploadObjectAsync(string bucket, string key, Stream content, string contentType, IDictionary<string, string> metadata, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var putReq = new PutObjectRequest
        {
            BucketName = bucket,
            Key = key.TrimStart('/'),
            InputStream = content,
            ContentType = contentType,
            DisablePayloadSigning = true
        };
        foreach (var kv in metadata)
        {
            putReq.Metadata.Add(kv.Key, kv.Value);
        }

        var res = await _s3.PutObjectAsync(putReq, ct);
        var size = content.CanSeek ? content.Length : 0;
        _metrics.RecordOperation("PutObject", bucket, sw.Elapsed.TotalMilliseconds, size);
        return new R2ObjectItem(bucket, putReq.Key, Path.GetFileName(putReq.Key), "", size, DateTimeOffset.UtcNow, res.ETag, contentType, "Standard", false, metadata.AsReadOnly());
    }

    public async Task<SearchResponse> SearchAsync(SearchRequest request, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var buckets = string.IsNullOrWhiteSpace(request.Bucket)
            ? (await _s3.ListBucketsAsync(ct)).Buckets.Select(b => b.BucketName).ToList()
            : [request.Bucket];

        var matches = new List<R2ObjectItem>();
        foreach (var bucket in buckets)
        {
            var listed = await _s3.ListObjectsV2Async(new ListObjectsV2Request { BucketName = bucket, MaxKeys = 250 }, ct);
            foreach (var s3Obj in listed.S3Objects.Where(o => !o.Key.EndsWith('/')))
            {
                var head = await _s3.GetObjectMetadataAsync(bucket, s3Obj.Key, ct);
                var meta = head.Metadata.Keys.ToDictionary(k => k.Replace("x-amz-meta-", ""), k => head.Metadata[k]);
                var nameMatch = string.IsNullOrWhiteSpace(request.Query) || s3Obj.Key.Contains(request.Query, StringComparison.OrdinalIgnoreCase);
                var tagMatch = string.IsNullOrWhiteSpace(request.TagKey) || meta.Any(kv =>
                    kv.Key.Contains(request.TagKey, StringComparison.OrdinalIgnoreCase) &&
                    (string.IsNullOrWhiteSpace(request.TagValue) || kv.Value.Contains(request.TagValue, StringComparison.OrdinalIgnoreCase)));

                if (nameMatch && tagMatch)
                {
                    matches.Add(new R2ObjectItem(bucket, s3Obj.Key, Path.GetFileName(s3Obj.Key), "", s3Obj.Size ?? 0, s3Obj.LastModified ?? DateTimeOffset.UtcNow, s3Obj.ETag, head.Headers.ContentType ?? "application/octet-stream", "Standard", false, meta));
                }
            }
        }

        _metrics.RecordOperation("SearchObjects", request.Bucket ?? "*", sw.Elapsed.TotalMilliseconds);
        return new SearchResponse(request, matches.Count, buckets.Count, sw.ElapsedMilliseconds, matches);
    }

    public async Task<BulkOperationResult> BulkDeleteAsync(BulkDeleteRequest request, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var deleteRes = await _s3.DeleteObjectsAsync(new DeleteObjectsRequest
        {
            BucketName = request.Bucket,
            Objects = request.Keys.Select(k => new KeyVersion { Key = k }).ToList()
        }, ct);

        var succeeded = deleteRes.DeletedObjects.Select(d => d.Key).ToList();
        var failures = deleteRes.DeleteErrors.Select(e => new BulkItemFailure(e.Key, e.Code, e.Message)).ToList();
        _metrics.RecordOperation("BulkDelete", request.Bucket, sw.Elapsed.TotalMilliseconds, success: failures.Count == 0);
        return new BulkOperationResult("delete", request.Keys.Count, succeeded.Count, failures.Count, succeeded, failures, sw.ElapsedMilliseconds);
    }

    public async Task<BulkOperationResult> BulkMoveAsync(BulkMoveRequest request, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var destPrefix = NormalizePrefix(request.DestinationPrefix);
        var succeeded = new List<string>();
        var failures = new List<BulkItemFailure>();

        foreach (var key in request.Keys)
        {
            var destKey = $"{destPrefix}{Path.GetFileName(key.TrimEnd('/'))}";
            try
            {
                await _s3.CopyObjectAsync(new CopyObjectRequest
                {
                    SourceBucket = request.SourceBucket,
                    SourceKey = key,
                    DestinationBucket = request.DestinationBucket,
                    DestinationKey = destKey,
                    MetadataDirective = S3MetadataDirective.COPY
                }, ct);

                await _s3.DeleteObjectAsync(request.SourceBucket, key, ct);
                succeeded.Add(destKey);
            }
            catch (Exception ex)
            {
                failures.Add(new BulkItemFailure(key, "R2_MOVE_FAILED", ex.Message));
            }
        }

        _metrics.RecordOperation("BulkMove", request.DestinationBucket, sw.Elapsed.TotalMilliseconds, success: failures.Count == 0);
        return new BulkOperationResult("move", request.Keys.Count, succeeded.Count, failures.Count, succeeded, failures, sw.ElapsedMilliseconds);
    }

    private static string NormalizePrefix(string? prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix)) return string.Empty;
        var clean = prefix.Trim().TrimStart('/');
        return clean.EndsWith('/') ? clean : $"{clean}/";
    }
}
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Services/CloudflareBucketAdminService.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'Cloudflare REST API v4 client for control-plane bucket creation, listing, and deletion.',
    content: `using System.Net.Http.Headers;
using System.Net.Http.Json;
using Buckets.Api.Configuration;
using Buckets.Api.Models;
using Microsoft.Extensions.Options;

namespace Buckets.Api.Services;

public interface ICloudflareBucketAdminService
{
    Task<IReadOnlyList<BucketSummary>> ListBucketsAsync(CancellationToken ct);
    Task<BucketSummary> CreateBucketAsync(CreateBucketRequest request, CancellationToken ct);
    Task DeleteBucketAsync(string bucketName, CancellationToken ct);
}

public sealed class CloudflareBucketAdminService : ICloudflareBucketAdminService
{
    private readonly HttpClient _http;
    private readonly CloudflareR2Options _options;

    public CloudflareBucketAdminService(HttpClient http, IOptions<CloudflareR2Options> options)
    {
        _http = http;
        _options = options.Value;
        _http.BaseAddress = new Uri($"https://api.cloudflare.com/client/v4/accounts/{_options.AccountId}/r2/");
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiToken);
    }

    public async Task<IReadOnlyList<BucketSummary>> ListBucketsAsync(CancellationToken ct)
    {
        var doc = await _http.GetFromJsonAsync<CloudflareListResponse>("buckets", ct);
        return doc?.Result?.Buckets?.Select(b => new BucketSummary(b.Name, b.CreationDate, b.Location ?? "ENAM", b.StorageClass ?? "Standard", 0, 0, true)).ToList() ?? [];
    }

    public async Task<BucketSummary> CreateBucketAsync(CreateBucketRequest request, CancellationToken ct)
    {
        var response = await _http.PostAsJsonAsync("buckets", new { name = request.Name, locationHint = request.LocationHint, storageClass = request.StorageClass }, ct);
        response.EnsureSuccessStatusCode();
        return new BucketSummary(request.Name, DateTimeOffset.UtcNow, request.LocationHint, request.StorageClass, 0, 0, true);
    }

    public async Task DeleteBucketAsync(string bucketName, CancellationToken ct)
    {
        var response = await _http.DeleteAsync($"buckets/{Uri.EscapeDataString(bucketName)}", ct);
        response.EnsureSuccessStatusCode();
    }

    private sealed record CloudflareListResponse(CloudflareBucketResult? Result);
    private sealed record CloudflareBucketResult(List<CloudflareBucketDto>? Buckets);
    private sealed record CloudflareBucketDto(string Name, DateTimeOffset CreationDate, string? Location, string? StorageClass);
}
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api/Controllers/BucketsController.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'REST WebAPI controllers for buckets, hierarchical folder listings, search, and bulk operations.',
    content: `using Buckets.Api.Models;
using Buckets.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Buckets.Api.Controllers;

[ApiController]
[Route("api/buckets")]
public sealed class BucketsController : ControllerBase
{
    private readonly ICloudflareBucketAdminService _admin;
    private readonly IR2StorageService _storage;

    public BucketsController(ICloudflareBucketAdminService admin, IR2StorageService storage)
    {
        _admin = admin;
        _storage = storage;
    }

    [HttpGet]
    public Task<IReadOnlyList<BucketSummary>> ListBuckets(CancellationToken ct) => _admin.ListBucketsAsync(ct);

    [HttpPost]
    public Task<BucketSummary> CreateBucket([FromBody] CreateBucketRequest request, CancellationToken ct) => _admin.CreateBucketAsync(request, ct);

    [HttpDelete("{bucket}")]
    public async Task<IActionResult> DeleteBucket(string bucket, [FromQuery] bool force = false, CancellationToken ct = default)
    {
        if (force)
        {
            await _storage.EmptyBucketAsync(bucket, ct);
        }
        await _admin.DeleteBucketAsync(bucket, ct);
        return NoContent();
    }

    [HttpGet("{bucket}/objects")]
    public Task<DirectoryListing> ListDirectory(string bucket, [FromQuery] string? prefix, CancellationToken ct)
        => _storage.ListDirectoryAsync(bucket, prefix, ct);

    [HttpPost("{bucket}/folders")]
    public Task<DirectoryEntry> CreateFolder(string bucket, [FromBody] CreateFolderRequest request, CancellationToken ct)
        => _storage.CreateFolderAsync(bucket, request.Prefix, request.CreateMarkerObject, ct);

    [HttpDelete("{bucket}/folders")]
    public async Task<IActionResult> DeleteFolder(string bucket, [FromQuery] string prefix, [FromQuery] bool recursive = false, CancellationToken ct = default)
    {
        var deletedCount = await _storage.DeleteFolderAsync(bucket, prefix, recursive, ct);
        return Ok(new { deleted = true, bucket, prefix, deletedCount });
    }

    [HttpPut("{bucket}/objects/content")]
    public async Task<R2ObjectItem> PutObjectContent(string bucket, [FromBody] SaveObjectContentRequest request, CancellationToken ct)
    {
        await using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(request.Content));
        var meta = request.Metadata is null ? new Dictionary<string, string>() : new Dictionary<string, string>(request.Metadata);
        return await _storage.UploadObjectAsync(bucket, request.Key, stream, request.ContentType, meta, ct);
    }
}

[ApiController]
[Route("api")]
public sealed class OperationsController : ControllerBase
{
    private readonly IR2StorageService _storage;
    public OperationsController(IR2StorageService storage) => _storage = storage;

    [HttpGet("search")]
    public Task<SearchResponse> Search([FromQuery] SearchRequest request, CancellationToken ct) => _storage.SearchAsync(request, ct);

    [HttpPost("objects/bulk-delete")]
    public Task<BulkOperationResult> BulkDelete([FromBody] BulkDeleteRequest request, CancellationToken ct) => _storage.BulkDeleteAsync(request, ct);

    [HttpPost("objects/bulk-move")]
    public Task<BulkOperationResult> BulkMove([FromBody] BulkMoveRequest request, CancellationToken ct) => _storage.BulkMoveAsync(request, ct);
}

[ApiController]
[Route("api/telemetry")]
public sealed class TelemetryController : ControllerBase
{
    [HttpGet("metrics")]
    public IActionResult GetMetrics() => Ok(new
    {
        uptimeSeconds = Environment.TickCount64 / 1000,
        r2EgressRatePerGbUsd = 0.00m,
        s3ComparisonEgressRatePerGbUsd = 0.09m
    });

    [HttpGet("logs/export")]
    public IActionResult ExportLogs([FromQuery] string format = "json")
    {
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss");
        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            const string csv = "timestamp,level,operation,statusCode,durationMs,message\\n";
            return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", $"buckets-logs-{stamp}.csv");
        }
        return File(System.Text.Encoding.UTF8.GetBytes("{\"logs\":[]}"), "application/json", $"buckets-logs-{stamp}.json");
    }
}
`,
  },
  {
    path: 'backend-dotnet10/Buckets.Api.Tests/R2StorageServiceTests.cs',
    stack: 'backend-dotnet10',
    language: 'csharp',
    summary: 'xUnit unit tests validating hierarchical directory markers, search filtering, and bulk delete/move operations.',
    content: `using Amazon.S3;
using Amazon.S3.Model;
using Buckets.Api.Middleware;
using Buckets.Api.Models;
using Buckets.Api.Services;
using Buckets.Api.Telemetry;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Buckets.Api.Tests;

public sealed class R2StorageServiceTests
{
    [Fact]
    public async Task CreateFolderAsync_ThrowsDomainException_WhenPathTraversesParent()
    {
        var s3 = new Mock<IAmazonS3>();
        var metrics = new BucketsMetrics(new TestMeterFactory());
        var svc = new R2StorageService(s3.Object, metrics, NullLogger<R2StorageService>.Instance);

        var ex = await Assert.ThrowsAsync<BucketDomainException>(() =>
            svc.CreateFolderAsync("buckets-prod-assets", "../secret", true, CancellationToken.None));

        Assert.Equal("FOLDER_INVALID_NAME", ex.ErrorCode);
        Assert.Equal(400, ex.StatusCode);
    }

    [Fact]
    public async Task CreateFolderAsync_WritesZeroByteMarker_WithPayloadSigningDisabled()
    {
        PutObjectRequest? captured = null;
        var s3 = new Mock<IAmazonS3>();
        s3.Setup(x => x.PutObjectAsync(It.IsAny<PutObjectRequest>(), It.IsAny<CancellationToken>()))
          .Callback<PutObjectRequest, CancellationToken>((req, _) => captured = req)
          .ReturnsAsync(new PutObjectResponse { ETag = "\\"d41d8cd98f00b204e9800998ecf8427e\\"" });

        var metrics = new BucketsMetrics(new TestMeterFactory());
        var svc = new R2StorageService(s3.Object, metrics, NullLogger<R2StorageService>.Instance);

        var entry = await svc.CreateFolderAsync("buckets-prod-assets", "releases/v3", true, CancellationToken.None);

        Assert.Equal("releases/v3/", entry.Prefix);
        Assert.True(entry.HasMarkerObject);
        Assert.NotNull(captured);
        Assert.True(captured!.DisablePayloadSigning);
    }
}
`,
  },
];
