import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = { 'Content-Type': 'application/json' };

export default function () {
  let contentId;

  group('create content', () => {
    const payload = JSON.stringify({
      title: `Benchmark ${randomString(8)}`,
      body: `Load test content body ${randomString(32)}`,
      status: 'draft',
    });

    const res = http.post(`${BASE_URL}/api/v1/content`, payload, { headers });

    check(res, {
      'create: status is 201': (r) => r.status === 201,
      'create: has id': (r) => {
        const body = r.json();
        contentId = body.id;
        return !!contentId;
      },
    });
  });

  group('get content', () => {
    if (!contentId) return;

    const res = http.get(`${BASE_URL}/api/v1/content/${contentId}`);

    check(res, {
      'get: status is 200': (r) => r.status === 200,
      'get: correct id': (r) => r.json().id === contentId,
    });
  });

  group('list content', () => {
    const res = http.get(`${BASE_URL}/api/v1/content?limit=10&offset=0`);

    check(res, {
      'list: status is 200': (r) => r.status === 200,
      'list: has items array': (r) => Array.isArray(r.json().items),
    });
  });

  group('update content', () => {
    if (!contentId) return;

    const payload = JSON.stringify({
      title: `Updated ${randomString(8)}`,
      status: 'published',
    });

    const res = http.put(`${BASE_URL}/api/v1/content/${contentId}`, payload, { headers });

    check(res, {
      'update: status is 200': (r) => r.status === 200,
      'update: status changed': (r) => r.json().status === 'published',
    });
  });

  group('delete content', () => {
    if (!contentId) return;

    const res = http.del(`${BASE_URL}/api/v1/content/${contentId}`);

    check(res, {
      'delete: status is 204': (r) => r.status === 204,
    });
  });

  sleep(0.1);
}
