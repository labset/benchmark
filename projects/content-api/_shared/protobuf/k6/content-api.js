import grpc from 'k6/net/grpc';
import { check, group, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const GRPC_HOST = __ENV.GRPC_HOST || 'localhost:8080';
const PROTO_DIR = __ENV.PROTO_DIR || '';

const client = new grpc.Client();

if (PROTO_DIR) {
  client.load(
    [PROTO_DIR],
    'content/v1/content_service.proto',
    'content/v1/content_model.proto',
  );
}

export const options = {
  thresholds: {
    grpc_req_duration: ['p(95)<500'],
  },
};

export default function () {
  client.connect(GRPC_HOST, { plaintext: true });

  let contentId;

  group('create content', () => {
    const res = client.invoke('content.v1.ContentService/CreateContent', {
      title: `Benchmark ${randomString(8)}`,
      body: `Load test content body ${randomString(32)}`,
      status: 'CONTENT_STATUS_DRAFT',
    });

    check(res, {
      'create: status is OK': (r) => r && r.status === grpc.StatusOK,
      'create: has id': (r) => {
        contentId = r && r.message && r.message.content && r.message.content.id;
        return !!contentId;
      },
    });
  });

  group('get content', () => {
    if (!contentId) return;

    const res = client.invoke('content.v1.ContentService/GetContent', {
      id: contentId,
    });

    check(res, {
      'get: status is OK': (r) => r && r.status === grpc.StatusOK,
      'get: correct id': (r) =>
        r && r.message && r.message.content && r.message.content.id === contentId,
    });
  });

  group('list content', () => {
    const res = client.invoke('content.v1.ContentService/ListContent', {
      pageSize: 10,
    });

    check(res, {
      'list: status is OK': (r) => r && r.status === grpc.StatusOK,
      'list: has items': (r) => r && r.message && Array.isArray(r.message.items),
    });
  });

  group('update content', () => {
    if (!contentId) return;

    const res = client.invoke('content.v1.ContentService/UpdateContent', {
      id: contentId,
      content: {
        title: `Updated ${randomString(8)}`,
        status: 'CONTENT_STATUS_PUBLISHED',
      },
      updateMask: { paths: ['title', 'status'] },
    });

    check(res, {
      'update: status is OK': (r) => r && r.status === grpc.StatusOK,
      'update: status changed': (r) =>
        r &&
        r.message &&
        r.message.content &&
        r.message.content.status === 'CONTENT_STATUS_PUBLISHED',
    });
  });

  group('delete content', () => {
    if (!contentId) return;

    const res = client.invoke('content.v1.ContentService/DeleteContent', {
      id: contentId,
    });

    check(res, {
      'delete: status is OK': (r) => r && r.status === grpc.StatusOK,
      'delete: success': (r) => r && r.message && r.message.success === true,
    });
  });

  client.close();
  sleep(0.1);
}
