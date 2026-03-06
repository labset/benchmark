import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const GRAPHQL_URL = `${BASE_URL}/graphql`;

export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = { 'Content-Type': 'application/json' };

function graphql(query, variables = {}) {
  return http.post(GRAPHQL_URL, JSON.stringify({ query, variables }), { headers });
}

export default function () {
  let contentId;

  group('create content', () => {
    const res = graphql(
      `mutation CreateContent($input: CreateContentInput!) {
        createContent(input: $input) {
          id title body status createdAt updatedAt
        }
      }`,
      {
        input: {
          title: `Benchmark ${randomString(8)}`,
          body: `Load test content body ${randomString(32)}`,
          status: 'DRAFT',
        },
      }
    );

    check(res, {
      'create: status is 200': (r) => r.status === 200,
      'create: has id': (r) => {
        const body = r.json();
        contentId = body.data && body.data.createContent && body.data.createContent.id;
        return !!contentId;
      },
      'create: no errors': (r) => !r.json().errors,
    });
  });

  group('get content', () => {
    if (!contentId) return;

    const res = graphql(
      `query GetContent($id: ID!) {
        content(id: $id) {
          id title body status createdAt updatedAt
        }
      }`,
      { id: contentId }
    );

    check(res, {
      'get: status is 200': (r) => r.status === 200,
      'get: correct id': (r) => {
        const body = r.json();
        return body.data && body.data.content && body.data.content.id === contentId;
      },
    });
  });

  group('list content', () => {
    const res = graphql(
      `query ListContent($limit: Int, $offset: Int) {
        contents(limit: $limit, offset: $offset) {
          items { id title status }
          total limit offset
        }
      }`,
      { limit: 10, offset: 0 }
    );

    check(res, {
      'list: status is 200': (r) => r.status === 200,
      'list: has items': (r) => {
        const body = r.json();
        return body.data && Array.isArray(body.data.contents.items);
      },
    });
  });

  group('update content', () => {
    if (!contentId) return;

    const res = graphql(
      `mutation UpdateContent($id: ID!, $input: UpdateContentInput!) {
        updateContent(id: $id, input: $input) {
          id title status updatedAt
        }
      }`,
      {
        id: contentId,
        input: {
          title: `Updated ${randomString(8)}`,
          status: 'PUBLISHED',
        },
      }
    );

    check(res, {
      'update: status is 200': (r) => r.status === 200,
      'update: status changed': (r) => {
        const body = r.json();
        return body.data && body.data.updateContent && body.data.updateContent.status === 'PUBLISHED';
      },
    });
  });

  group('delete content', () => {
    if (!contentId) return;

    const res = graphql(
      `mutation DeleteContent($id: ID!) {
        deleteContent(id: $id)
      }`,
      { id: contentId }
    );

    check(res, {
      'delete: status is 200': (r) => r.status === 200,
      'delete: success': (r) => {
        const body = r.json();
        return body.data && body.data.deleteContent === true;
      },
    });
  });

  sleep(0.1);
}
