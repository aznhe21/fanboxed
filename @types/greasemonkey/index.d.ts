interface XhrDetails {
  url: string;
  method: string;

  headers?: Record<string, string>;
  responseType?: XMLHttpRequestResponseType;

  onerror?(response: XhrResponse): void;
  onload?(response: XhrResponse): void;
}

interface XhrResponse {
  readonly response: any;
}

interface Greasemonkey {
  xmlHttpRequest(details: XhrDetails): void;
}

declare var GM: Greasemonkey;
