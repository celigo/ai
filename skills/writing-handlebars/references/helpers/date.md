# Date/Time Helpers

Date formatting, arithmetic, and timestamps using moment.js tokens.

### dateAdd
Use {{dateAdd}} to add or subtract a specific time offset (in milliseconds) from a given date, optionally applying a time zone for the resulting ISO 8601 timestamp. Typical uses include adjusting a date by days/hours or converting a timestamp to a particular time zone.

Usage

{{dateAdd dateField offsetField timeZoneField}}

dateField (required): The date to be adjusted (e.g., a string like "2025-03-26T00:00:00Z", or a reference like record.orderDate).

offsetField (optional): Time offset in milliseconds. Prepend a minus sign (-) to subtract instead of add. For example, "86400000" = +1 day; "-86400000" = -1 day.

timeZoneField (optional): A valid time zone identifier (e.g., "America/New_York", "Asia/Hong_Kong"). If omitted, the output remains in UTC with no specific offset.

Note

supported by the Celigo platform, see integrator.io supported time zones.

Examples

No offset or time zone

{{dateAdd record.orderDate}}

If record.orderDate is "2025-03-26T12:34:56Z", the output is "2025-03-26T12:34:56.000Z" in ISO 8601 UTC format.

Adding one day

{{dateAdd record.orderDate "86400000"}}

If record.orderDate is "2025-03-26T12:34:56Z", adds 24 hours and returns "2025-03-27T12:34:56.000Z".

Subtracting twelve hours

{{dateAdd record.shipDate "-43200000"}}

If record.shipDate is "2025-05-10T00:00:00Z", subtracts half a day, yielding "2025-05-09T12:00:00.000Z".

Applying a time zone

{{dateAdd record.orderDate "86400000" "Asia/Hong_Kong"}}

If record.orderDate is "2025-03-26T00:00:00Z", adds 24 hours and shifts to Hong Kong time, resulting in "2025-03-27T08:00:00.000+08:00".

Hard-coded date string

{{dateAdd "Mon Nov 21 2019 20:00:00 GMT+0000"}}

Outputs "2019-11-21T20:00:00.000Z" in ISO format.

Tip

Offset values must be in milliseconds (e.g., 86400000 for one day). Scientific notation (e.g., "1E6") is also supported.

Negative offsets (e.g., "-86400000") subtract that time from the given date.

Time zones use IANA identifiers (e.g., "America/Los_Angeles"). If you omit this parameter, the result is in UTC.

The final output always conforms to an ISO 8601 date-time string, with or without the explicit offset depending on whether timeZoneField is provided.

### dateFormat
Use {{dateFormat}} to format a date/time string into a desired output format, optionally specifying how the input is formatted and which time zone to apply.

Usage

{{dateFormat outputFormat date inputFormat timezone}}

outputFormat: The format you want for the final date/time (e.g., "MM-DD-YYYY HH:mm", "YYYY-MM-DDTHH:mm:ssZ").

date: The date to transform (e.g., record.orderDate or a string like "1966-25-05 18:36").

inputFormat (optional): The format of the passed-in date if it's not in standard ISO or another automatically recognized format (e.g., "YYYY-DD-MM HH:mm").

timezone (optional): A valid time zone ID (e.g., "America/Los_Angeles"). If used with a "Z" in `outputFormat`, the output includes the corresponding time zone offset.

Note

supported by the Celigo platform, see integrator.io supported time zones.

Examples

Format an ISO date to US style

{{dateFormat "MM-DD-YYYY hh:mm A" record.orderDate}}

If record.orderDate is "2025-03-26T12:34:56Z", the output might be "03-26-2025 12:34 PM".

Reinterpreting custom input format

{{dateFormat "MM-DD-YYYY hh:mm" record.orderDate "YYYY-DD-MM HH:mm"}}

If record.orderDate is "1966-25-05 18:36", where the day is in the middle, this outputs "05-25-1966 18:36".

Applying time zone and offset

{{dateFormat "YYYY-MM-DDTHH:mm:ssZ" record.orderDate "" "Asia/Hong_Kong"}}

Converts record.orderDate to Hong Kong time, displaying the offset in the final string (e.g., +08:00).

Tip

Common tokens include YYYY (year), MM (month), DD (day), HH or hh (hour), mm (minute), ss (seconds), A or a (AM/PM), and Z (time zone offset).

If the date doesn't match a known format, use `inputFormat` to specify how to parse it. Omit it for standard ISO 8601 inputs.

When including "Z" in `outputFormat`, the offset reflects the provided timezone if one is specified. If not, it defaults to UTC.

Time zone IDs follow IANA naming (e.g., "America/New_York", "Europe/London").

### timestamp
The timestamp helper generates the current date/time string in a specified format and timezone. If you omit the format, the helper uses an ISO8601 default. If you omit the timezone, it defaults to UTC rather than using any profile-based settings.

Usage

{{timestamp format timezone}}

format (optional): The date/time format pattern (e.g., "YYYY-MM-DD HH:mm:ss" or "HH:MM:SS"). Defaults to ISO8601 if not specified.

timezone (optional): A valid timezone identifier (e.g., "America/Los_Angeles"). Defaults to UTC if not specified.

Examples

Display local time in Los Angeles

{{timestamp "HH:MM:SS" "America/Los_Angeles"}}

Example output: 08:09:09 (local time with offset).

Use a custom format in UTC

{{timestamp "YYYY-MM-DD HH:mm:ss"}}

Generates: 2025-04-20 17:38:20 in UTC.

Tip

Always specify the timezone parameter to avoid confusion with default timezones.

Check which date/time format tokens are supported in your Celigo environment (typically ISO-style or standard format strings).

If you need to manipulate dates further (e.g., add days/hours), consider other date/time helpers that might be available, or handle the logic before calling timestamp.

## Date/time format codes

Celigo uses the moment.js library. The dateFormat helper accepts these format tokens.

Reference timestamp for all examples: 2020-07-09T19:59:39.156Z

### Month
M → 7 (no padding)
Mo → 7th (ordinal)
MM → 07 (2-digit)
MMM → Jul (3-letter)
MMMM → July (full name)

### Quarter
Q → 3
Qo → 3rd

### Day of month
D → 9 (no padding)
Do → 9th (ordinal)
DD → 09 (2-digit)

### Day of year
DDD → 191
DDDo → 191st
DDDD → 191 (3-digit padded)

### Day of week
d → 4 (0=Sunday)
do → 4th
dd → Th (2-letter)
ddd → Thu (3-letter)
dddd → Thursday (full)
e → 4 (locale-aware first day)
E → 4 (ISO, 1=Monday)

### Week of year
w/W → 28
wo/Wo → 28th
ww/WW → 28 (2-digit)

### Year
YY → 20 (2-digit)
YYYY → 2020 (4-digit)
gg → 20 (week year 2-digit)
gggg → 2020 (week year 4-digit)
GG → 20 (ISO week year 2-digit)
GGGG → 2020 (ISO week year 4-digit)

### AM/PM
A → PM (uppercase)
a → pm (lowercase)

### Hour
H → 19 (24h, no pad)
HH → 19 (24h, 2-digit)
h → 7 (12h, no pad)
hh → 07 (12h, 2-digit)

### Minute
m → 59 (no pad)
mm → 59 (2-digit)

### Second
s → 39 (no pad)
ss → 39 (2-digit)

### Fractional second
S → 1 (1-digit)
SS → 16 (2-digit)
SSS → 161 (milliseconds)

### Timezone
Z → +00:00 (colon)
ZZ → +0000 (no colon)

### Unix timestamp
X → 1594324779 (seconds)
x → 1594324779162 (milliseconds)

### Localized formats
LT → 7:59 PM
LTS → 7:59:39 PM
L → 07/09/2020
l → 7/9/2020
LL → July 9, 2020
ll → Jul 9, 2020
LLL → July 9, 2020 7:59 PM
lll → Jul 9, 2020 7:59 PM
LLLL → Thursday, July 9, 2020 7:59 PM
llll → Thu, Jul 9, 2020 7:59 PM

### Literal text in format strings
Square brackets escape literal characters:

{{{dateFormat "YYYY-MM-DD [at] HH:mm" timeStamp}}} → 2020-07-09 at 19:59

### Timezone handling

dateAdd accepts a timezone parameter to convert dates to ISO 8601:

{{dateAdd Date "" "US/Central"}} — converts "03/10/1990" to 1990-03-09T18:00:00-06:00

Common timezone values: US/Eastern, US/Central, US/Mountain, US/Pacific, UTC, Europe/London, Asia/Tokyo, Australia/Sydney

IMPORTANT: The timestamp helper in imports defaults to the account owner's profile timezone (not UTC). Always set the timezone explicitly:

{{timestamp "" "UTC"}}
