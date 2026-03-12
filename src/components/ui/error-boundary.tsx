'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    }

    public static getDerivedStateFromError(_: Error): State {
        return { hasError: true }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo)
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback

            return (
                <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                    <div className="h-20 w-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
                        <AlertTriangle className="h-10 w-10 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold font-heading mb-2">Ops! Algo deu errado.</h2>
                    <p className="text-muted-foreground max-w-xs mb-8">
                        Ocorreu um erro inesperado ao carregar esta parte do sistema.
                    </p>
                    <Button 
                        onClick={() => this.setState({ hasError: false })}
                        className="gradient-bronze border-0 text-white gap-2 h-11 px-8 rounded-xl shadow-lg shadow-bronze/10"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Tentar Novamente
                    </Button>
                </div>
            )
        }

        return this.props.children
    }
}
