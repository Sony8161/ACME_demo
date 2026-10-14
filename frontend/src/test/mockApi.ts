import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { http } from '../api/client'

const realAdapter = http.defaults.adapter

/** Answer every API call with this status and body (no network). Returns the requests the app sent, for assertions. */
export function mockApi(status: number, body: unknown): InternalAxiosRequestConfig[] {
  const sent: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config)
    const response = { data: body, status, statusText: '', headers: {}, config }
    if (status >= 400) throw new AxiosError(`status ${status}`, 'ERR_BAD_REQUEST', config, null, response)
    return response
  }
  http.defaults.adapter = adapter
  return sent
}

/** Make every API call fail the way a dropped connection does, or with a timeout. */
export function mockNoAnswer(code: 'ERR_NETWORK' | 'ECONNABORTED' = 'ERR_NETWORK') {
  http.defaults.adapter = async (config) => {
    throw new AxiosError('no answer', code, config)
  }
}

export function restoreApi() {
  http.defaults.adapter = realAdapter
}
