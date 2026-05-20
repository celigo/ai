# Auth/Crypto Helpers

AWS Signature v4, hash digests, and HMAC authentication.

### aws4
Use the {{{aws4}}} helper to generate an AWS Signature Version 4 for authenticating API requests to Amazon Web Services. Provide your AWS credentials and service details, and this helper returns the authorization signature string you can include in an HTTP header.

Usage

{{{aws4 accessKey secretKey sessionToken region serviceName}}}

accessKey: AWS access key (e.g., "AKIA...").

secretKey: AWS secret key.

sessionToken: Optional; use null or "" if no session token is needed.

region: For example, "us-east-1" or "" to rely on a default derived from the request URL.

serviceName: For example, "execute-api" or "" to infer from the request URL.

Examples

Basic usage with explicit credentials

{{{aws4 "AKIAxxxxxxxx" "xxxxxxxxxxxxxx" null "us-east-1" "execute-api"}}}

Generates a signature for an AWS API in the us-east-1 region targeting the execute-api service.

Referencing encrypted fields from the Celigo connection

{{{aws4 connection.http.encrypted.accessKey connection.http.encrypted.secretKey null
"us-west-2"
"s3"}}}

Ideal when credentials are stored securely in the connection object; this example signs requests for S3 in the us-west-2 region.

Using session token

{{{aws4 connection.http.encrypted.accessKey connection.http.encrypted.secretKey connection.http.encrypted.sessionToken
"us-east-1"
"execute-api"}}}

If your AWS environment requires temporary credentials, pass the session token accordingly.

Tip

Always specify region and serviceName for accurate signatures; relying on an inferred default can produce mismatches with AWS.

Include the generated signature in your HTTP Authorization header, and remember to provide an X-Amz-Date header if required by your AWS service.

Store AWS credentials in [connection.http.encrypted] fields to avoid exposing secret values in plain text.

Provide an X-Amz-Date header with the correct format if your AWS service requires it. For example:

"X-Amz-Date": "{{{timestamp "YYYYMMDDTHHmmss" "Etc/GMT-0"}}}Z"

This ensures AWS recognizes the request date/time and can validate the signature.

### hash
Use {{hash}} to apply a cryptographic hash (e.g., MD5, SHA-256) to a string or field value, returning the result in the specified encoding format.

Usage

{{hash algorithm encoding field}}

algorithm: A supported hashing algorithm (e.g., "md5", "sha256", "sha1").

encoding: The output format of the hashed value ("hex" or "base64" are most common).

field: The actual data (literal or field reference) to be hashed.

Note

See Supported cryptographic encoding algorithms.

For additional functionality, see Using hashOptions.

Examples

Hash a record field with MD5 and base64

{{hash "md5" "base64" record.name}}

If record.name is "Bob", this outputs an MD5 hash of "Bob" encoded in base64.

SHA-256 hash in hex

{{hash "sha256" "hex" "HelloWorld"}}

Produces a hex-encoded SHA-256 hash of the string "HelloWorld".

Tip

Choose stronger algorithms (e.g., SHA-256) for better security over weaker ones like MD5.

Ensure the input field is a string or can be converted to one.

The hash output is irreversible—if you need keyed signatures (authentication), see the hmac helper instead.

### hmac
Use {{hmac}} to generate an HMAC (keyed-hash message authentication code) from a given field or string, using a secret key and a supported hash algorithm. This verifies data integrity and authenticity when sending requests.

Usage

{{hmac "algorithm" key "encoding" field keyEncoding}}

algorithm: One of Celigo's supported cryptographic algorithms (e.g., "sha256", "sha1", "md5").

key: The path to your secret key in dot notation (e.g., connection.http.encrypted.secretKey).

encoding: The format of the resulting HMAC (e.g., "hex" or "base64").

field: The string or field path whose value you want to authenticate.

keyEncoding (optional): How the secret key is encoded ("utf8" or "base64"). Defaults to "utf8" if not specified.

Note

See Using hmacOptions for additional functionality.

Examples

HMAC-SHA256 with a secure key

{{hmac "sha256" connection.http.encrypted.secretKey "hex" record.payload}}

Uses the secret key in connection.http.encrypted.secretKey

Produces a hex-encoded SHA-256 HMAC of record.payload

Base64-encoded key and field

{{hmac "sha1" connection.http.encrypted.secretKey "base64" record.body "base64"}}

Interprets the secret key as base64

Returns a base64-encoded SHA-1 signature of record.body

Tip

Secure your secret key: Always store it in encrypted fields to prevent exposure (e.g., connection.http.encrypted).

Use HTTPS: HMAC is most effective when transmitted securely over HTTPS.

URI-encode parameters if your authentication scheme requires signing the entire URL, including query parameters.

No dot notation for the HMAC result: The field parameter must be a direct string or field path; referencing nested objects (e.g., record.property) typically works, but passing the result of hmac further with dot notation is not supported.

For additional control (e.g., signing a full URL or customizing the signature process), see hmacOptions in Celigo's documentation.

## hashOptions and hmacOptions

### hashOptions

When using the hash helper to generate authentication headers or URI parameters, the Celigo platform provides a hashOptions object with request context:

hashOptions.headers — request header parameters
hashOptions.body — HTTP request body (string)
hashOptions.bodyParametersMap — body parameters
hashOptions.method — HTTP method (GET, POST, PUT, etc.)
hashOptions.http.encrypted — contents of connection's http.encrypted field (store keys here)
hashOptions.baseURI — base URI (e.g., www.celigo-test.com)
hashOptions.relativeURI — relative URI (e.g., /this/is/a/test)
hashOptions.urlParameters — query string (e.g., username=Integrator&domain=IO)
hashOptions.urlParametersMap — URL parameters as map
hashOptions.URI — full URI

HASH-SHA256 digest from full URI in base64:
{{{hash "sha256" hashOptions.http.encrypted.hashKey "base64" hashOptions.URI}}}

HASH-SHA256 digest from request body in hex:
{{{hash "sha256" hashOptions.http.encrypted.hashKey "hex" hashOptions.body}}}

### hmacOptions

When using the hmac helper to generate authentication headers or URI parameters, the Celigo platform provides an hmacOptions object:

hmacOptions.headers — request header parameters
hmacOptions.body — HTTP request body (string)
hmacOptions.bodyParametersMap — body parameters
hmacOptions.method — HTTP method (GET, POST, PUT, etc.)
hmacOptions.http.encrypted — contents of connection's http.encrypted field (store keys here)
hmacOptions.baseURI — base URI (e.g., www.celigo-test.com)
hmacOptions.relativeURI — relative URI (e.g., /this/is/a/test)
hmacOptions.urlParameters — query string (e.g., username=Integrator&domain=IO)
hmacOptions.urlParametersMap — URL parameters as map
hmacOptions.URI — full URI
hmacOptions.orderedQueryParams — query params in alphabetical order (excluding 'sign' and 'access_token')

HMAC-SHA256 digest from full URI in base64:
{{{hmac "sha256" hmacOptions.http.encrypted.hmacKey "base64" hmacOptions.URI}}}

HMAC-SHA256 digest from request body in hex:
{{{hmac "sha256" hmacOptions.http.encrypted.hmacKey "hex" hmacOptions.body}}}
