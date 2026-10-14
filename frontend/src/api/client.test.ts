import { ApiError, api, setToken, setUnauthorizedHandler } from './client'

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({ ok: status < 400, status, text: async () => (body === null ? '' : JSON.stringify(body)) })
}

afterEach(() => {
  vi.unstubAllGlobals()
  setToken(null)
  setUnauthorizedHandler(() => {})
})

describe('api client', () => {
  it('sends the token and converts keys both ways', async () => {
    const fetchMock = respond(200, { project_id: 'p1' })
    vi.stubGlobal('fetch', fetchMock)
    setToken('abc')
    const out = await api.post<{ projectId: string }>('/projects', { managerId: 'm1' })
    expect(out.projectId).toBe('p1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/pm-api/projects')
    expect(init.headers.Authorization).toBe('Bearer abc')
    expect(JSON.parse(init.body)).toEqual({ manager_id: 'm1' })
  })

  it('turns the API error shape into an ApiError with the server sentence', async () => {
    vi.stubGlobal('fetch', respond(409, { error: { code: 'assignment_overlap', message: 'Alex is already on another milestone', details: [{ field: 'start_date', message: 'Overlaps' }] } }))
    await expect(api.post('/x')).rejects.toMatchObject({ status: 409, code: 'assignment_overlap', message: 'Alex is already on another milestone' })
  })

  it('drops empty query values and sends the rest', async () => {
    const fetchMock = respond(200, { items: [] })
    vi.stubGlobal('fetch', fetchMock)
    await api.get('/projects', { q: '', status: 'active', page_size: 10 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/pm-api/projects?status=active&page_size=10')
  })

  it('signs the user out when a signed-in call gets 401, but not on a wrong password', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    setToken('abc')
    vi.stubGlobal('fetch', respond(401, { error: { code: 'token_revoked', message: 'Please sign in again' } }))
    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)

    vi.stubGlobal('fetch', respond(401, { error: { code: 'invalid_credentials', message: 'Invalid username or password' } }))
    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('explains a network failure in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.get('/health')).rejects.toMatchObject({ code: 'network_error', message: expect.stringContaining('Cannot reach the server') })
  })
})
