import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';

const GRPC_HOST = __ENV.GRPC_HOST || 'localhost:8080';
const GRPC_SERVICE = __ENV.GRPC_SERVICE || '';
const GRPC_METHOD = __ENV.GRPC_METHOD || '';
const PROTO_DIR = __ENV.PROTO_DIR || '';
const PROTO_FILES = (__ENV.PROTO_FILES || '').split(',').filter(Boolean);

const client = new grpc.Client();

if (PROTO_DIR && PROTO_FILES.length > 0) {
  client.load([PROTO_DIR], ...PROTO_FILES);
}

export const options = {
  thresholds: {
    grpc_req_duration: ['p(95)<500'],
  },
};

export default function () {

  client.connect(GRPC_HOST, { plaintext: true });

  const response = client.invoke(`${GRPC_SERVICE}/${GRPC_METHOD}`, {});

  check(response, {
    'status is OK': (r) => r && r.status === grpc.StatusOK,
  });

  client.close();
  sleep(0.1);
}
