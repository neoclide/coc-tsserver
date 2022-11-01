/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getTempFile } from '../utils/temp'
import Tracer from '../utils/tracer'
import fs from 'fs'

export interface OngoingRequestCanceller {
  readonly cancellationPipeName: string | undefined
  tryCancelOngoingRequest(seq: number): boolean
}

export interface OngoingRequestCancellerFactory {
  create(serverId: string, tracer: Tracer): OngoingRequestCanceller
}


const noopRequestCanceller = new class implements OngoingRequestCanceller {
  public readonly cancellationPipeName = undefined;

  public tryCancelOngoingRequest(_seq: number): boolean {
    return false
  }
}

export const noopRequestCancellerFactory = new class implements OngoingRequestCancellerFactory {
  create(_serverId: string, _tracer: Tracer): OngoingRequestCanceller {
    return noopRequestCanceller
  }
}

export class NodeRequestCanceller implements OngoingRequestCanceller {
  public readonly cancellationPipeName: string

  public constructor(
    private readonly _serverId: string,
    private readonly _tracer: Tracer,
  ) {
    this.cancellationPipeName = getTempFile('tscancellation')
  }

  public tryCancelOngoingRequest(seq: number): boolean {
    if (!this.cancellationPipeName) {
      return false
    }
    this._tracer.logTrace(this._serverId, `TypeScript Server: trying to cancel ongoing request with sequence number ${seq}`)
    try {
      fs.writeFileSync(this.cancellationPipeName + seq, '')
    } catch {
      // noop
    }
    return true
  }
}


export const nodeRequestCancellerFactory = new class implements OngoingRequestCancellerFactory {
  create(serverId: string, tracer: Tracer): OngoingRequestCanceller {
    return new NodeRequestCanceller(serverId, tracer)
  }
}
