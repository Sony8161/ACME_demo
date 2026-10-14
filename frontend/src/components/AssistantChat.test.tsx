import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { http } from '../api/client'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { AssistantChat } from './AssistantChat'

vi.setConfig({ testTimeout: 30_000 })

const reply = (over: Record<string, unknown> = {}) => ({ reply: 'Two things are late.', mode: 'offline', tools_used: ['attention'], notice: null, ...over })
const status = { mode: 'offline', model: null }

function show(role: 'admin' | 'manager' | 'employee' = 'manager', routes: Record<string, unknown> = {}, compact = false) {
  const sent: { messages: { role: string; content: string }[] }[] = []
  mockRoutes({
    'GET /assistant/status': status,
    'POST /assistant/chat': (c: InternalAxiosRequestConfig) => { sent.push(JSON.parse(c.data as string)); return reply() },
    ...routes,
  })
  render(<AssistantChat role={role} compact={compact} />)
  return sent
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'Ask the assistant' }))
const ask = async (question: string) => {
  await userEvent.type(screen.getByRole('textbox', { name: 'Your question' }), question)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
}

afterEach(restoreApi)

describe('AssistantChat', () => {
  it('is a button until opened, then a panel that can be closed again, also with Escape', async () => {
    show()
    expect(screen.queryByRole('complementary', { name: 'Assistant' })).not.toBeInTheDocument()
    await open()
    expect(screen.getByRole('complementary', { name: 'Assistant' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close the assistant' }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    await open()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('says which assistant is answering', async () => {
    show('manager', { 'GET /assistant/status': { mode: 'ai', model: 'm' } })
    await open()
    expect(await screen.findByText('AI')).toBeInTheDocument()
  })

  it('says it is the built-in one when there is no AI key', async () => {
    show()
    await open()
    expect(await screen.findByText('Built-in')).toBeInTheDocument()
  })

  it('still works when the status cannot be loaded', async () => {
    show('manager', { 'GET /assistant/status': apiError(500, 'server_error', 'nope') })
    await open()
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeInTheDocument()
    expect(screen.queryByText('AI')).not.toBeInTheDocument()
  })

  it('sends the question and shows the answer, and what it was built from', async () => {
    const sent = show()
    await open()
    await ask('What is late?')
    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(await within(log).findByText('Two things are late.')).toBeInTheDocument()
    expect(within(log).getByText('What is late?')).toBeInTheDocument()
    expect(within(log).getByText('Looked at: what needs attention')).toBeInTheDocument()
    expect(sent).toEqual([{ messages: [{ role: 'user', content: 'What is late?' }] }])
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue('')
  })

  it('sends the whole conversation each time, so a follow-up has its context', async () => {
    const sent = show()
    await open()
    await ask('What is late?')
    await screen.findByText('Two things are late.')
    await ask('And blocked?')
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1].messages).toEqual([
      { role: 'user', content: 'What is late?' },
      { role: 'assistant', content: 'Two things are late.' },
      { role: 'user', content: 'And blocked?' },
    ])
  })

  it('offers questions to try, different for an employee than for a manager', async () => {
    show('employee')
    await open()
    expect(screen.getByRole('button', { name: 'Show my tasks' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Who is free this week?' })).not.toBeInTheDocument()
  })

  it('asks a suggested question with one click', async () => {
    const sent = show('manager')
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Who is free this week?' }))
    await waitFor(() => expect(sent[0]?.messages[0].content).toBe('Who is free this week?'))
    expect(screen.queryByRole('button', { name: 'Who is free this week?' })).not.toBeInTheDocument()
  })

  it('cannot send an empty question', async () => {
    show()
    await open()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Your question' }), '   ')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('shows a waiting message and blocks a second question while one is being answered', async () => {
    let release: () => void = () => undefined
    const pending = new Promise<void>((r) => { release = r })
    show()
    const answering = http.defaults.adapter
    http.defaults.adapter = async (config) => {
      if (config.url === '/assistant/chat') await pending
      return (answering as (c: typeof config) => Promise<never>)(config)
    }
    await open()
    await ask('What is late?')
    expect(await screen.findByRole('status')).toHaveTextContent('Thinking')
    await userEvent.type(screen.getByRole('textbox', { name: 'Your question' }), 'more')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    release()
    expect(await screen.findByText('Two things are late.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the server\'s own sentence when it fails, and lets the person dismiss it', async () => {
    show('manager', { 'POST /assistant/chat': apiError(429, 'rate_limited', 'You are asking too fast. Please try again in 8 seconds.') })
    await open()
    await ask('What is late?')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('You are asking too fast. Please try again in 8 seconds.')
    await userEvent.click(within(alert).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('passes on the notice when the built-in assistant answered because the AI service failed', async () => {
    show('manager', { 'POST /assistant/chat': reply({ notice: 'The AI service did not answer, so this is the built-in assistant\'s answer.' }) })
    await open()
    await ask('What is late?')
    expect(await screen.findByText(/The AI service did not answer/)).toBeInTheDocument()
  })

  it('clears the conversation', async () => {
    show()
    await open()
    expect(screen.getByRole('button', { name: 'Clear the conversation' })).toBeDisabled()
    await ask('What is late?')
    await screen.findByText('Two things are late.')
    await userEvent.click(screen.getByRole('button', { name: 'Clear the conversation' }))
    expect(screen.queryByText('Two things are late.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What is blocked?' })).toBeInTheDocument()
  })

  it('names a lookup it does not know by its own name', async () => {
    show('manager', { 'POST /assistant/chat': reply({ tools_used: ['something_new'] }) })
    await open()
    await ask('hi')
    expect(await screen.findByText('Looked at: something_new')).toBeInTheDocument()
  })

  it('sits above the bottom bar on a phone', () => {
    show('manager', {}, true)
    expect(screen.getByRole('button', { name: 'Ask the assistant' })).toBeInTheDocument()
  })
})
