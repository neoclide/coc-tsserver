/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type ITask<T> = () => T

export class Delayer<T> {

  public defaultDelay: number
  private timeout: any // Timer
  private completionPromise: Promise<T | undefined> | null
  private onSuccess: ((value: T | PromiseLike<T> | undefined) => void) | null
  private task: ITask<T> | null

  constructor(defaultDelay: number) {
    this.defaultDelay = defaultDelay
    this.timeout = null
    this.completionPromise = null
    this.onSuccess = null
    this.task = null
  }

  public trigger(task: ITask<T>, delay: number = this.defaultDelay): Promise<T | undefined> {
    this.task = task
    if (delay >= 0) {
      this.cancelTimeout()
    }

    if (!this.completionPromise) {
      this.completionPromise = new Promise<T | undefined>((resolve) => {
        this.onSuccess = resolve
      }).then(() => {
        this.completionPromise = null
        this.onSuccess = null
        const result = this.task?.()
        this.task = null
        return result
      })
    }

    if (delay >= 0 || this.timeout === null) {
      this.timeout = setTimeout(() => {
        this.timeout = null
        this.onSuccess?.(undefined)
      }, delay >= 0 ? delay : this.defaultDelay)
    }

    return this.completionPromise
  }

  public cancelTimeout(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }
}
