import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';

const GRPC_HOST = __ENV.GRPC_HOST || 'localhost:50051';
const GRPC_SERVICE = __ENV.GRPC_SERVICE || '';
const GRPC_METHOD = __ENV.GRPC_METHOD || '';
const PROTO_PATH = __ENV.PROTO_PATH || '';

const client = new grpc.Client();

export const options = {
  thresholds: {
    grpc_req_duration: ['p(95)<500'],
  },
};

export default function () {
  if (PROTO_PATH) {
    client.load([], PROTO_PATH);
  }

  client.connect(GRPC_HOST, { plaintext: true });

  const response = client.invoke(`${GRPC_SERVICE}/${GRPC_METHOD}`, {});

  check(response, {
    'status is OK': (r) => r && r.status === grpc.StatusOK,
  });

  client.close();
  sleep(0.1);
}
