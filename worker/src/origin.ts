export function allowedRequestOrigin(request: Request, configuredOrigin: string): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin || origin === configuredOrigin;
}
