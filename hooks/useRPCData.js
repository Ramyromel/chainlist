import { useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import axios from "axios";

const refetchInterval = 60_000;

export const rpcBody = JSON.stringify({
  jsonrpc: "2.0",
  method: "eth_getBlockByNumber",
  params: ["latest", false],
  id: 1,
});

const fetchChain = async (baseURL) => {
  if (baseURL.includes("API_KEY")) return null;
  try {
    const API = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    API.interceptors.request.use((request) => {
      request.requestStart = Date.now();
      return request;
    });

    API.interceptors.response.use(
      (response) => {
        response.latency = Date.now() - response.config.requestStart;
        return response;
      },
      (error) => {
        if (error.response) {
          error.response.latency = null;
        }

        return Promise.reject(error);
      },
    );

    const { data, latency } = await API.post("", rpcBody);

    return { ...data, latency };
  } catch (error) {
    return null;
  }
};

const formatData = (url, data) => {
  let height = data?.result?.number ?? null;
  let latency = data?.latency ?? null;
  if (height) {
    const hexString = height.toString(16);
    height = parseInt(hexString, 16);
  } else {
    latency = null;
  }
  return { url, height, latency };
};

const useHttpQuery = (url) => {
  return {
    queryKey: [url],
    queryFn: () => fetchChain(url),
    refetchInterval,
    select: useCallback((data) => formatData(url, data), [url]),
  };
};

function createPromise() {
  let resolve, reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  promise.resolve = resolve;
  promise.reject = reject;

  return promise;
}

const fetchWssChain = async (baseURL) => {
  try {
    const queryFn = createPromise();

    const socket = new WebSocket(baseURL);
    let requestStart;

    socket.onopen = () => {
      socket.send(rpcBody);
      requestStart = Date.now();
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      const latency = Date.now() - requestStart;
      queryFn.resolve({ ...data, latency });
    };

    socket.onerror = (e) => {
      queryFn.reject(e);
    };

    return await queryFn;
  } catch (error) {
    return null;
  }
};

const useSocketQuery = (url) => {
  return {
    queryKey: [url],
    queryFn: () => fetchWssChain(url),
    select: useCallback((data) => formatData(url, data), [url]),
    refetchInterval,
  };
};

const useRPCData = (urls) => {
  const queries =
    urls?.map((url) => (url.url.includes("wss://") ? useSocketQuery(url.url) : useHttpQuery(url.url))) ?? [];

  return useQueries({ queries });
};

export default useRPCData;
