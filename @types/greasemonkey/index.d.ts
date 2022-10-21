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
  getValue(name: string): Promise<string | number | boolean | undefined>;
  getValue(name: string, defaultValue: string | number | boolean): Promise<string | number | boolean>;
  setValue(name: string, value: string | number | boolean): Promise<void>;
  xmlHttpRequest(details: XhrDetails): void;
}

declare var GM: Greasemonkey;
