import grpc from 'k6/net/grpc';
import { check, group, sleep } from 'k6';

const GRPC_HOST = __ENV.GRPC_HOST || 'localhost:8080';

const client = new grpc.Client();

export const options = {
  thresholds: {
    grpc_req_duration: ['p(95)<500'],
  },
};

export default function () {
  client.connect(GRPC_HOST, { plaintext: true, reflect: true });

  let contentId;

  group('create content', () => {
    const res = client.invoke('content.v1.ContentService/CreateContent', {
      title: `Benchmark ${crypto.randomUUID()}`,
      body: `Load test content body ${crypto.randomUUID()}`,
      status: 'CONTENT_STATUS_DRAFT',
      tags: ['benchmark', 'k6'],
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
        title: `Updated ${crypto.randomUUID()}`,
        status: 'CONTENT_STATUS_PUBLISHED',
      },
      updateMask: 'title,status',
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
