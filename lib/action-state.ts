export interface ActionState {
  status: 'idle' | 'success' | 'error'
  message: string
  code?: string
}
